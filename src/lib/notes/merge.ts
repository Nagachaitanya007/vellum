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

/** Last-write-wins merge. Local dirty rows with a newer (or equal) updatedAt are kept and re-pushed. */
export function mergeVault(
  local: {
    notes: Note[];
    folders: Folder[];
    dirtyNoteIds: string[];
    pendingDeletes: string[];
    dirtyFolders: boolean;
  },
  remote: {
    notes: RemoteNote[];
    deletedIds: string[];
    folders: Folder[] | null;
  },
) {
  const dirty = new Set(local.dirtyNoteIds);
  const deleting = new Set(local.pendingDeletes);
  const remoteDeleted = new Set(remote.deletedIds);
  const localById = new Map(local.notes.map((item) => [item.id, item]));
  const remoteById = new Map(remote.notes.map((item) => [item.id, payloadToNote(item)]));
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
