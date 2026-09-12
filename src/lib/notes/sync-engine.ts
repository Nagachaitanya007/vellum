import type { Folder, Note } from "./types.ts";
import { mergeVault, type MergeResult } from "./merge.ts";

export type SyncSlice = {
  notes: Note[];
  folders: Folder[];
  dirtyNoteIds: string[];
  pendingDeletes: string[];
  pendingDeleteAt: Record<string, number>;
  dirtyFolders: boolean;
  foldersUpdatedAt: number;
  activeId: string | null;
};

export type UploadBatch = {
  notes: Array<{ id: string; updatedAt: number }>;
  deleted: Array<{ id: string; deletedAt: number }>;
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

function omitKey(map: Record<string, number>, id: string): Record<string, number> {
  if (!(id in map)) return map;
  const { [id]: _dropped, ...rest } = map;
  return rest;
}

export function captureDirty(state: SyncSlice): { batch: UploadBatch; payload: SavePayload } | null {
  if (!state.dirtyNoteIds.length && !state.pendingDeletes.length && !state.dirtyFolders) {
    return null;
  }
  const dirty = new Set(state.dirtyNoteIds);
  const notes = state.notes.filter((note) => dirty.has(note.id));
  const liveIds = new Set(state.notes.map((note) => note.id));
  const deleted: Array<{ id: string; deletedAt: number }> = [];
  for (const id of state.pendingDeletes) {
    if (liveIds.has(id)) continue;
    const deletedAt = state.pendingDeleteAt[id];
    if (typeof deletedAt !== "number" || !Number.isFinite(deletedAt)) continue;
    deleted.push({ id, deletedAt });
  }
  if (!notes.length && !deleted.length && !state.dirtyFolders) {
    return null;
  }
  const foldersUpdatedAt = state.dirtyFolders ? state.foldersUpdatedAt : null;
  return {
    batch: {
      notes: notes.map((note) => ({ id: note.id, updatedAt: note.updatedAt })),
      deleted: deleted.map((item) => ({ id: item.id, deletedAt: item.deletedAt })),
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
): Pick<SyncSlice, "dirtyNoteIds" | "pendingDeletes" | "pendingDeleteAt" | "dirtyFolders"> {
  const noteById = new Map(state.notes.map((note) => [note.id, note]));
  const dirty = new Set(state.dirtyNoteIds);
  const deleting = new Set(state.pendingDeletes);
  let deleteAt = { ...state.pendingDeleteAt };

  for (const uploaded of batch.notes) {
    const current = noteById.get(uploaded.id);
    if (!current) continue;
    if (current.updatedAt === uploaded.updatedAt) dirty.delete(uploaded.id);
  }

  for (const tomb of batch.deleted) {
    const currentDeleteAt = deleteAt[tomb.id];
    if (noteById.has(tomb.id)) {
      if (currentDeleteAt === tomb.deletedAt || currentDeleteAt == null) {
        deleting.delete(tomb.id);
        deleteAt = omitKey(deleteAt, tomb.id);
      }
      dirty.add(tomb.id);
    } else if (deleting.has(tomb.id) && currentDeleteAt === tomb.deletedAt) {
      deleting.delete(tomb.id);
      deleteAt = omitKey(deleteAt, tomb.id);
    }
  }

  let dirtyFolders = state.dirtyFolders;
  if (batch.foldersUpdatedAt != null && dirtyFolders && state.foldersUpdatedAt === batch.foldersUpdatedAt) {
    dirtyFolders = false;
  }

  return {
    dirtyNoteIds: [...dirty],
    pendingDeletes: [...deleting],
    pendingDeleteAt: deleteAt,
    dirtyFolders,
  };
}

/**
 * Apply a merge result without clobbering edits that landed after mergeVault ran.
 * Current pending deletes win unless the merged note is a newer version.
 */
export function reconcileMerge(merged: MergeResult, current: SyncSlice): SyncSlice {
  const currentById = new Map(current.notes.map((note) => [note.id, note]));
  const mergedById = new Map(merged.notes.map((note) => [note.id, note]));
  const deleting = new Set(current.pendingDeletes);
  const dirty = new Set(current.dirtyNoteIds);
  const mergedDirty = new Set(merged.dirtyNoteIds);
  let deleteAt = { ...current.pendingDeleteAt };
  const ids = new Set([...currentById.keys(), ...mergedById.keys()]);
  const notes: Note[] = [];
  const stillDirty: string[] = [];

  for (const id of ids) {
    const cur = currentById.get(id);
    const mer = mergedById.get(id);
    if (deleting.has(id)) {
      const delAt = deleteAt[id];
      if (mer && typeof delAt === "number" && mer.updatedAt > delAt) {
        deleting.delete(id);
        deleteAt = omitKey(deleteAt, id);
        notes.push(mer);
        if (mergedDirty.has(id)) stillDirty.push(id);
      }
      continue;
    }
    if (cur && dirty.has(id) && (!mer || cur.updatedAt >= mer.updatedAt)) {
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
    pendingDeleteAt: deleteAt,
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
