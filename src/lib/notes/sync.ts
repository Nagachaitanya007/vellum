import { loadVault, saveVaultChanges } from "./api";
import { mergeVault } from "./merge";
import {
  acknowledgeUpload,
  captureDirty,
  reconcileMerge,
  type SyncSlice,
} from "./sync-engine";
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

function toSlice(): SyncSlice {
  const state = useNotesStore.getState();
  return {
    notes: state.notes,
    folders: state.folders,
    dirtyNoteIds: state.dirtyNoteIds,
    pendingDeletes: state.pendingDeletes,
    dirtyFolders: state.dirtyFolders,
    foldersUpdatedAt: state.foldersUpdatedAt,
    activeId: state.activeId,
  };
}

async function pushCurrentDirty() {
  const captured = captureDirty(toSlice());
  if (!captured) return;
  await saveVaultChanges({ data: captured.payload });
  useNotesStore.setState(acknowledgeUpload(toSlice(), captured.batch));
}

export async function flushVaultNow() {
  if (!syncEnabled || inFlight) return;
  inFlight = true;
  setStatus("syncing");
  try {
    const snapshot = await loadVault();
    const merged = mergeVault(toSlice(), snapshot);
    const reconciled = reconcileMerge(merged, toSlice());
    useNotesStore.setState({
      notes: reconciled.notes,
      folders: reconciled.folders,
      dirtyNoteIds: reconciled.dirtyNoteIds,
      pendingDeletes: reconciled.pendingDeletes,
      dirtyFolders: reconciled.dirtyFolders,
      foldersUpdatedAt: reconciled.foldersUpdatedAt,
      activeId: reconciled.activeId,
    });

    const captured = captureDirty(toSlice());
    if (captured) {
      await saveVaultChanges({ data: captured.payload });
      useNotesStore.setState(acknowledgeUpload(toSlice(), captured.batch));
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
