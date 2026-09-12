import type { Folder, Note } from "./types.ts";
import { mergeVault, type MergeResult } from "./merge.ts";

export type SyncSlice = {
  notes: Note[];
  folders: Folder[];
  dirtyNoteIds: string[];
  pendingDeletes: string[];
  dirtyFolders: boolean;
  foldersUpdatedAt: number;
  activeId: string | null;
};

export type UploadBatch = {
  notes: Array<{ id: string; updatedAt: number }>;
  deleted: Array<{ id: string }>;
  /** Set when this upload included folders; null means folders were not sent. */
  foldersUpdatedAt: number | null;
};

export type SavePayload = {
  notes: Array<{
    id: string;
    title: string;
    content: string;
    folderId: string | null;
    pinned: boolean;
    kind: Note["kind"];
    drawing: Note["drawing"];
    createdAt: number;
    updatedAt: number;
  }>;
  deleted: Array<{ id: string; deletedAt: number }>;
  folders?: Folder[];
  foldersUpdatedAt?: number;
};

export function captureDirty(state: SyncSlice): { batch: UploadBatch; payload: SavePayload } | null {
  if (!state.dirtyNoteIds.length && !state.pendingDeletes.length && !state.dirtyFolders) {
    return null;
  }
  const dirty = new Set(state.dirtyNoteIds);
  const notes = state.notes.filter((note) => dirty.has(note.id));
  const liveIds = new Set(state.notes.map((note) => note.id));
  const deletedAt = Date.now();
  const deleted = state.pendingDeletes
    .filter((id) => !liveIds.has(id))
    .map((id) => ({ id, deletedAt }));
  if (!notes.length && !deleted.length && !state.dirtyFolders) {
    return null;
  }
  const foldersUpdatedAt = state.dirtyFolders ? state.foldersUpdatedAt : null;
  return {
    batch: {
      notes: notes.map((note) => ({ id: note.id, updatedAt: note.updatedAt })),
      deleted: deleted.map((item) => ({ id: item.id })),
      foldersUpdatedAt,
    },
    payload: {
      notes: notes.map((note) => ({
        id: note.id,
        title: note.title,
        content: note.content,
        folderId: note.folderId,
        pinned: note.pinned,
        kind: note.kind,
        drawing: note.drawing,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      })),
      deleted,
      ...(state.dirtyFolders
        ? { folders: state.folders, foldersUpdatedAt: state.foldersUpdatedAt }
        : {}),
    },
  };
}

/**
 * Clear dirty markers only for the exact versions that were uploaded.
 * Newer local edits, recreates, and newer folder timestamps stay dirty.
 */
export function acknowledgeUpload(
  state: SyncSlice,
  batch: UploadBatch,
): Pick<SyncSlice, "dirtyNoteIds" | "pendingDeletes" | "dirtyFolders"> {
  const noteById = new Map(state.notes.map((note) => [note.id, note]));
  const dirty = new Set(state.dirtyNoteIds);
  const deleting = new Set(state.pendingDeletes);

  for (const uploaded of batch.notes) {
    const current = noteById.get(uploaded.id);
    if (!current) continue;
    if (current.updatedAt === uploaded.updatedAt) dirty.delete(uploaded.id);
  }

  for (const tomb of batch.deleted) {
    if (noteById.has(tomb.id)) {
      deleting.delete(tomb.id);
      dirty.add(tomb.id);
    } else if (deleting.has(tomb.id)) {
      deleting.delete(tomb.id);
    }
  }

  let dirtyFolders = state.dirtyFolders;
  if (batch.foldersUpdatedAt != null && dirtyFolders && state.foldersUpdatedAt === batch.foldersUpdatedAt) {
    dirtyFolders = false;
  }

  return {
    dirtyNoteIds: [...dirty],
    pendingDeletes: [...deleting],
    dirtyFolders,
  };
}

/**
 * Apply a merge result without clobbering edits that landed after mergeVault ran.
 * Current pending deletes always win over a stale merge snapshot.
 */
export function reconcileMerge(merged: MergeResult, current: SyncSlice): SyncSlice {
  const currentById = new Map(current.notes.map((note) => [note.id, note]));
  const mergedById = new Map(merged.notes.map((note) => [note.id, note]));
  const deleting = new Set(current.pendingDeletes);
  const dirty = new Set(current.dirtyNoteIds);
  const mergedDirty = new Set(merged.dirtyNoteIds);
  const ids = new Set([...currentById.keys(), ...mergedById.keys()]);
  const notes: Note[] = [];
  const stillDirty: string[] = [];

  for (const id of ids) {
    if (deleting.has(id)) continue;
    const cur = currentById.get(id);
    const mer = mergedById.get(id);
    if (cur && dirty.has(id) && (!mer || cur.updatedAt > mer.updatedAt)) {
      notes.push(cur);
      stillDirty.push(id);
    } else if (mer) {
      notes.push(mer);
      if (mergedDirty.has(id)) stillDirty.push(id);
    } else if (cur) {
      notes.push(cur);
      if (dirty.has(id)) stillDirty.push(id);
    }
  }

  const remoteFolderAt = merged.foldersUpdatedAt ?? 0;
  const keepLocalFolders = current.dirtyFolders && current.foldersUpdatedAt >= remoteFolderAt;
  const folders = keepLocalFolders ? current.folders : merged.folders;
  const foldersUpdatedAt = keepLocalFolders
    ? current.foldersUpdatedAt
    : (merged.foldersUpdatedAt ?? current.foldersUpdatedAt);
  const dirtyFolders = keepLocalFolders;

  const activeStillThere = notes.some((note) => note.id === current.activeId);
  return {
    notes,
    folders,
    dirtyNoteIds: stillDirty,
    pendingDeletes: [...deleting],
    dirtyFolders,
    foldersUpdatedAt,
    activeId: activeStillThere ? current.activeId : (notes[0]?.id ?? null),
  };
}

export function nextAdoptVaultUser(
  state: { vaultOwnerId: string | null; lastVaultOwnerId: string | null },
  userId: string | null,
): { wipe: boolean; vaultOwnerId: string | null; lastVaultOwnerId: string | null } {
  if (userId === state.vaultOwnerId) {
    return {
      wipe: false,
      vaultOwnerId: state.vaultOwnerId,
      lastVaultOwnerId: userId ?? state.lastVaultOwnerId,
    };
  }
  if (userId == null) {
    return {
      wipe: false,
      vaultOwnerId: null,
      lastVaultOwnerId: state.lastVaultOwnerId ?? state.vaultOwnerId,
    };
  }
  const previous = state.vaultOwnerId ?? state.lastVaultOwnerId;
  if (previous === userId) {
    return { wipe: false, vaultOwnerId: userId, lastVaultOwnerId: userId };
  }
  return { wipe: true, vaultOwnerId: userId, lastVaultOwnerId: userId };
}

export { mergeVault };
