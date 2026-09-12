import { loadVault, noteToPayload, saveVaultChanges } from "./api";
import { mergeVault } from "./merge";
import { useNotesStore } from "./store";
import type { SyncStatus } from "./types";

export { mergeVault } from "./merge";

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
