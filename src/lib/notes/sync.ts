import { loadVault, noteToPayload, saveVaultChanges, type NotePayload } from "./api";
import { sortNotes } from "./helpers";
import { useNotesStore } from "./store";
import type { Folder, Note, SyncStatus } from "./types";

const POLL_MS = 6000;
const PUSH_MS = 500;

let syncEnabled = false;
let inFlight = false;
let pushTimer: ReturnType<typeof setInterval> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export function isUnauthorized(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { status?: number; message?: string };
  return err.status === 401 || err.message === "Unauthorized";
}

function payloadToNote(payload: NotePayload): Note {
  return {
    id: payload.id,
    title: payload.title,
    content: payload.content,
    folderId: payload.folderId,
    pinned: payload.pinned,
    drawing: payload.drawing,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

export function mergeVault(
  local: {
    notes: Note[];
    folders: Folder[];
    dirtyNoteIds: string[];
    pendingDeletes: string[];
    dirtyFolders: boolean;
  },
  remote: {
    notes: NotePayload[];
    deletedIds: string[];
    folders: Folder[] | null;
  },
) {
  const dirty = new Set(local.dirtyNoteIds);
  const deleting = new Set(local.pendingDeletes);
  const remoteDeleted = new Set(remote.deletedIds);
  const localById = new Map(local.notes.map((note) => [note.id, note]));
  const remoteById = new Map(remote.notes.map((note) => [note.id, payloadToNote(note)]));
  const ids = new Set([...localById.keys(), ...remoteById.keys()]);

  const notes: Note[] = [];
  const toPush: Note[] = [];
  const stillDirty: string[] = [];
  const stillDelete: string[] = [];

  for (const id of ids) {
    const loc = localById.get(id);
    const rem = remoteById.get(id);
    const localDirty = dirty.has(id);

    if (deleting.has(id)) {
      stillDelete.push(id);
      continue;
    }
    if (remoteDeleted.has(id) && !localDirty) continue;

    if (loc && rem) {
      if (localDirty && loc.updatedAt >= rem.updatedAt) {
        notes.push(loc);
        toPush.push(loc);
        stillDirty.push(id);
      } else {
        notes.push(rem);
      }
    } else if (loc) {
      notes.push(loc);
      toPush.push(loc);
      if (localDirty) stillDirty.push(id);
    } else if (rem) {
      notes.push(rem);
    }
  }

  let folders = local.folders;
  let foldersToPush: Folder[] | null = null;
  let dirtyFolders = local.dirtyFolders;
  if (local.dirtyFolders) {
    foldersToPush = local.folders;
  } else if (remote.folders) {
    folders = remote.folders.length > 0 ? remote.folders : local.folders;
    if (remote.folders.length === 0 && local.folders.length > 0) {
      foldersToPush = local.folders;
      dirtyFolders = true;
    }
  } else if (local.folders.length > 0) {
    foldersToPush = local.folders;
    dirtyFolders = true;
  }

  return {
    notes: sortNotes(notes),
    folders,
    toPush,
    toDelete: stillDelete,
    foldersToPush,
    dirtyNoteIds: stillDirty,
    pendingDeletes: stillDelete,
    dirtyFolders,
  };
}

function setStatus(status: SyncStatus, extra?: { lastSyncedAt?: number | null }) {
  useNotesStore.setState({
    syncStatus: status,
    ...(extra ?? {}),
  });
}

function applyMerged(
  merged: ReturnType<typeof mergeVault>,
) {
  const current = useNotesStore.getState();
  const activeStillThere = merged.notes.some((note) => note.id === current.activeId);
  useNotesStore.setState({
    notes: merged.notes,
    folders: merged.folders,
    dirtyNoteIds: merged.dirtyNoteIds,
    pendingDeletes: merged.pendingDeletes,
    dirtyFolders: merged.dirtyFolders,
    activeId: activeStillThere ? current.activeId : (merged.notes[0]?.id ?? null),
  });
}

async function pushCurrentDirty() {
  const state = useNotesStore.getState();
  const notes = state.notes.filter((note) => state.dirtyNoteIds.includes(note.id));
  const deletedAt = Date.now();
  if (!notes.length && !state.pendingDeletes.length && !state.dirtyFolders) return;
  await saveVaultChanges({
    data: {
      notes: notes.map(noteToPayload),
      deleted: state.pendingDeletes.map((id) => ({ id, deletedAt })),
      folders: state.dirtyFolders ? state.folders : undefined,
    },
  });
  useNotesStore.setState({
    dirtyNoteIds: [],
    pendingDeletes: [],
    dirtyFolders: false,
  });
}

export async function flushVaultNow() {
  if (!syncEnabled || inFlight) return;
  inFlight = true;
  setStatus("syncing");
  try {
    const snapshot = await loadVault();
    const merged = mergeVault(
      {
        notes: useNotesStore.getState().notes,
        folders: useNotesStore.getState().folders,
        dirtyNoteIds: useNotesStore.getState().dirtyNoteIds,
        pendingDeletes: useNotesStore.getState().pendingDeletes,
        dirtyFolders: useNotesStore.getState().dirtyFolders,
      },
      snapshot,
    );
    applyMerged(merged);

    if (merged.toPush.length || merged.toDelete.length || merged.foldersToPush) {
      const deletedAt = Date.now();
      await saveVaultChanges({
        data: {
          notes: merged.toPush.map(noteToPayload),
          deleted: merged.toDelete.map((id) => ({ id, deletedAt })),
          folders: merged.foldersToPush ?? undefined,
        },
      });
      useNotesStore.setState({
        dirtyNoteIds: [],
        pendingDeletes: [],
        dirtyFolders: false,
      });
    }

    setStatus("synced", { lastSyncedAt: Date.now() });
  } catch (error) {
    if (isUnauthorized(error)) {
      setStatus("local", { lastSyncedAt: null });
      return;
    }
    setStatus("error");
  } finally {
    inFlight = false;
  }
}

async function pushIfDirty() {
  if (!syncEnabled || inFlight) return;
  const state = useNotesStore.getState();
  if (!state.dirtyNoteIds.length && !state.pendingDeletes.length && !state.dirtyFolders) {
    return;
  }
  inFlight = true;
  try {
    await pushCurrentDirty();
    setStatus("synced", { lastSyncedAt: Date.now() });
  } catch (error) {
    if (isUnauthorized(error)) {
      setStatus("local", { lastSyncedAt: null });
      return;
    }
    setStatus("error");
  } finally {
    inFlight = false;
  }
}

export function startVaultSync() {
  syncEnabled = true;
  setStatus("syncing");
  void flushVaultNow();
  if (!pushTimer) {
    pushTimer = setInterval(() => {
      void pushIfDirty();
    }, PUSH_MS);
  }
  if (!pollTimer) {
    pollTimer = setInterval(() => {
      void flushVaultNow();
    }, POLL_MS);
  }
}

export function stopVaultSync() {
  syncEnabled = false;
  if (pushTimer) {
    clearInterval(pushTimer);
    pushTimer = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  setStatus("local");
}
