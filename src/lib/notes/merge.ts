import type { Drawing, Folder, Note, NoteKind } from "./types.ts";

export type RemoteNote = {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  pinned: boolean;
  kind: NoteKind;
  drawing: Drawing;
  createdAt: number;
  updatedAt: number;
};

export type MergeInput = {
  notes: Note[];
  folders: Folder[];
  dirtyNoteIds: string[];
  pendingDeletes: string[];
  pendingDeleteAt?: Record<string, number>;
  dirtyFolders: boolean;
  foldersUpdatedAt?: number;
};

export type MergeRemote = {
  notes: RemoteNote[];
  deletedIds: string[];
  deletedAt?: Record<string, number>;
  folders: Folder[] | null;
  foldersUpdatedAt?: number | null;
};

export type MergeResult = {
  notes: Note[];
  folders: Folder[];
  toPush: Note[];
  toDelete: string[];
  foldersToPush: Folder[] | null;
  dirtyNoteIds: string[];
  pendingDeletes: string[];
  pendingDeleteAt: Record<string, number>;
  dirtyFolders: boolean;
  foldersUpdatedAt: number;
};

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

function payloadToNote(payload: RemoteNote): Note {
  return {
    id: payload.id,
    title: payload.title,
    content: payload.content,
    folderId: payload.folderId,
    pinned: payload.pinned,
    kind: payload.kind === "canvas" ? "canvas" : "markdown",
    drawing: payload.drawing,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

function omitKey(map: Record<string, number>, id: string): Record<string, number> {
  if (!(id in map)) return map;
  const { [id]: _dropped, ...rest } = map;
  return rest;
}

/** Last-write-wins merge. Local dirty rows with a newer (or equal) version are kept and re-pushed. */
export function mergeVault(local: MergeInput, remote: MergeRemote): MergeResult {
  const dirty = new Set(local.dirtyNoteIds);
  const deleting = new Set(local.pendingDeletes);
  const deleteAt = { ...(local.pendingDeleteAt ?? {}) };
  const remoteDeleted = new Set(remote.deletedIds);
  const localById = new Map(local.notes.map((item) => [item.id, item]));
  const remoteById = new Map(remote.notes.map((item) => [item.id, payloadToNote(item)]));
  const ids = new Set([...localById.keys(), ...remoteById.keys(), ...deleting, ...remoteDeleted]);

  const notes: Note[] = [];
  const toPush: Note[] = [];
  const stillDirty: string[] = [];
  const stillDelete: string[] = [];
  let stillDeleteAt = { ...deleteAt };

  for (const id of ids) {
    const loc = localById.get(id);
    const rem = remoteById.get(id);
    const localDirty = dirty.has(id);

    if (deleting.has(id)) {
      const delAt = deleteAt[id];
      if (rem && typeof delAt === "number" && rem.updatedAt > delAt) {
        stillDeleteAt = omitKey(stillDeleteAt, id);
        notes.push(rem);
        continue;
      }
      stillDelete.push(id);
      continue;
    }
    if (remoteDeleted.has(id)) {
      const tombAt = remote.deletedAt?.[id];
      const localNewerThanTomb =
        localDirty && loc && (typeof tombAt !== "number" || loc.updatedAt > tombAt);
      if (!localNewerThanTomb) continue;
    }

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

  const localFolderAt = local.foldersUpdatedAt ?? 0;
  const remoteFolderAt = remote.foldersUpdatedAt ?? 0;
  let folders = local.folders;
  let foldersToPush: Folder[] | null = null;
  let dirtyFolders = local.dirtyFolders;
  let foldersUpdatedAt = localFolderAt;

  if (local.dirtyFolders && localFolderAt >= remoteFolderAt) {
    folders = local.folders;
    foldersToPush = local.folders;
    dirtyFolders = true;
    foldersUpdatedAt = localFolderAt;
  } else if (remote.folders != null) {
    folders = remote.folders;
    foldersToPush = null;
    dirtyFolders = false;
    foldersUpdatedAt = remoteFolderAt;
  } else if (local.folders.length > 0) {
    folders = local.folders;
    foldersToPush = local.folders;
    dirtyFolders = true;
    foldersUpdatedAt = localFolderAt || Date.now();
  }

  const pendingDeleteAt: Record<string, number> = {};
  for (const id of stillDelete) {
    if (typeof stillDeleteAt[id] === "number") pendingDeleteAt[id] = stillDeleteAt[id] as number;
  }

  return {
    notes: sortNotes(notes),
    folders,
    toPush,
    toDelete: stillDelete,
    foldersToPush,
    dirtyNoteIds: stillDirty,
    pendingDeletes: stillDelete,
    pendingDeleteAt,
    dirtyFolders,
    foldersUpdatedAt,
  };
}
