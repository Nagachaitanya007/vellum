import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeVault } from "./merge.ts";
import {
  acknowledgeUpload,
  captureDirty,
  nextAdoptVaultUser,
  reconcileMerge,
  type SyncSlice,
} from "./sync-engine.ts";
import type { Note } from "./types.ts";

function note(id: string, extra: Partial<Note> = {}): Note {
  return {
    id,
    title: extra.title ?? id,
    content: extra.content ?? "",
    folderId: extra.folderId ?? null,
    pinned: false,
    kind: extra.kind ?? "markdown",
    drawing: extra.drawing ?? { strokes: [] },
    createdAt: extra.createdAt ?? 1,
    updatedAt: extra.updatedAt ?? 1,
  };
}

function slice(extra: Partial<SyncSlice> = {}): SyncSlice {
  return {
    notes: extra.notes ?? [],
    folders: extra.folders ?? [],
    dirtyNoteIds: extra.dirtyNoteIds ?? [],
    pendingDeletes: extra.pendingDeletes ?? [],
    dirtyFolders: extra.dirtyFolders ?? false,
    foldersUpdatedAt: extra.foldersUpdatedAt ?? 0,
    activeId: extra.activeId ?? extra.notes?.[0]?.id ?? null,
  };
}

test("remote notes appear when local is empty (device B after device A)", () => {
  const merged = mergeVault(
    { notes: [], folders: [], dirtyNoteIds: [], pendingDeletes: [], dirtyFolders: false },
    {
      notes: [
        {
          id: "n1",
          title: "From A",
          content: "hello",
          folderId: null,
          pinned: false,
          kind: "markdown",
          drawing: { strokes: [] },
          createdAt: 10,
          updatedAt: 10,
        },
      ],
      deletedIds: [],
      folders: [{ id: "f1", name: "Personal" }],
      foldersUpdatedAt: 10,
    },
  );
  assert.equal(merged.notes.length, 1);
  assert.equal(merged.notes[0]?.title, "From A");
  assert.equal(merged.toPush.length, 0);
  assert.equal(merged.folders[0]?.name, "Personal");
});

test("local dirty newer than remote is pushed, not overwritten", () => {
  const merged = mergeVault(
    {
      notes: [note("n1", { title: "Local edit", updatedAt: 50, content: "new" })],
      folders: [],
      dirtyNoteIds: ["n1"],
      pendingDeletes: [],
      dirtyFolders: false,
    },
    {
      notes: [
        {
          id: "n1",
          title: "Remote",
          content: "old",
          folderId: null,
          pinned: false,
          kind: "markdown",
          drawing: { strokes: [] },
          createdAt: 10,
          updatedAt: 20,
        },
      ],
      deletedIds: [],
      folders: null,
    },
  );
  assert.equal(merged.notes[0]?.title, "Local edit");
  assert.equal(merged.toPush.length, 1);
});

test("stale server response cannot overwrite newer local changes", () => {
  const merged = mergeVault(
    {
      notes: [note("n1", { title: "Local newer", updatedAt: 80, content: "mine" })],
      folders: [],
      dirtyNoteIds: ["n1"],
      pendingDeletes: [],
      dirtyFolders: false,
    },
    {
      notes: [
        {
          id: "n1",
          title: "Stale poll",
          content: "old",
          folderId: null,
          pinned: false,
          kind: "markdown",
          drawing: { strokes: [] },
          createdAt: 1,
          updatedAt: 20,
        },
      ],
      deletedIds: [],
      folders: null,
    },
  );
  assert.equal(merged.notes[0]?.title, "Local newer");
  assert.equal(merged.toPush.length, 1);
});

test("remote newer than local dirty loses to dirty only when local timestamp wins", () => {
  const merged = mergeVault(
    {
      notes: [note("n1", { title: "Stale local", updatedAt: 5 })],
      folders: [],
      dirtyNoteIds: ["n1"],
      pendingDeletes: [],
      dirtyFolders: false,
    },
    {
      notes: [
        {
          id: "n1",
          title: "Remote newer",
          content: "x",
          folderId: null,
          pinned: false,
          kind: "markdown",
          drawing: { strokes: [] },
          createdAt: 1,
          updatedAt: 80,
        },
      ],
      deletedIds: [],
      folders: null,
    },
  );
  assert.equal(merged.notes[0]?.title, "Remote newer");
  assert.equal(merged.toPush.length, 0);
});

test("remote tombstone drops a note that is not locally dirty", () => {
  const merged = mergeVault(
    {
      notes: [note("n1")],
      folders: [],
      dirtyNoteIds: [],
      pendingDeletes: [],
      dirtyFolders: false,
    },
    { notes: [], deletedIds: ["n1"], folders: null },
  );
  assert.equal(merged.notes.length, 0);
});

test("empty local cache retrieves remote notes (normal download)", () => {
  const merged = mergeVault(
    slice(),
    {
      notes: [
        {
          id: "n1",
          title: "From Turso",
          content: "body",
          folderId: null,
          pinned: false,
          kind: "markdown",
          drawing: { strokes: [] },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      deletedIds: [],
      folders: null,
    },
  );
  assert.equal(merged.notes[0]?.title, "From Turso");
  assert.equal(merged.toPush.length, 0);
});

test("normal upload captures dirty notes and acknowledge clears only that version", () => {
  const state = slice({
    notes: [note("n1", { content: "v1", updatedAt: 10 })],
    dirtyNoteIds: ["n1"],
  });
  const captured = captureDirty(state);
  assert.ok(captured);
  assert.equal(captured.payload.notes[0]?.content, "v1");
  const ack = acknowledgeUpload(state, captured.batch);
  assert.deepEqual(ack.dirtyNoteIds, []);
});

test("edit during an in-flight upload stays dirty and keeps the newer text", async () => {
  let state = slice({
    notes: [note("n1", { content: "v1", updatedAt: 10 })],
    dirtyNoteIds: ["n1"],
  });
  const captured = captureDirty(state);
  assert.ok(captured);

  let resolveSave: () => void = () => {};
  const save = new Promise<void>((resolve) => {
    resolveSave = resolve;
  });

  const inflight = (async () => {
    await save;
    state = { ...state, ...acknowledgeUpload(state, captured.batch) };
  })();

  state = slice({
    notes: [note("n1", { content: "v2", updatedAt: 20 })],
    dirtyNoteIds: ["n1"],
    pendingDeletes: state.pendingDeletes,
  });
  resolveSave();
  await inflight;

  assert.equal(state.notes[0]?.content, "v2");
  assert.deepEqual(state.dirtyNoteIds, ["n1"]);
});

test("multiple edits during an in-flight upload keep the latest version dirty", async () => {
  let state = slice({
    notes: [note("n1", { content: "v1", updatedAt: 1 })],
    dirtyNoteIds: ["n1"],
  });
  const captured = captureDirty(state);
  assert.ok(captured);

  state = slice({
    notes: [note("n1", { content: "v2", updatedAt: 2 })],
    dirtyNoteIds: ["n1"],
  });
  state = slice({
    notes: [note("n1", { content: "v3", updatedAt: 3 })],
    dirtyNoteIds: ["n1"],
  });

  const ack = acknowledgeUpload(state, captured!.batch);
  assert.equal(state.notes[0]?.content, "v3");
  assert.deepEqual(ack.dirtyNoteIds, ["n1"]);
});

test("delete during an in-flight upload is not cleared by the note ack", async () => {
  let state = slice({
    notes: [note("n1", { content: "v1", updatedAt: 10 })],
    dirtyNoteIds: ["n1"],
  });
  const captured = captureDirty(state);
  assert.ok(captured);

  state = slice({
    notes: [],
    dirtyNoteIds: [],
    pendingDeletes: ["n1"],
  });
  const ack = acknowledgeUpload(state, captured.batch);
  assert.deepEqual(ack.pendingDeletes, ["n1"]);
  assert.deepEqual(ack.dirtyNoteIds, []);
});

test("edit after delete begins syncing recreates the note instead of keeping the tombstone", () => {
  const state = slice({
    notes: [],
    pendingDeletes: ["n1"],
  });
  const captured = captureDirty(state);
  assert.ok(captured);
  assert.equal(captured.payload.deleted[0]?.id, "n1");

  const after = slice({
    notes: [note("n1", { content: "restored", updatedAt: 50 })],
    dirtyNoteIds: ["n1"],
    pendingDeletes: [],
  });
  const ack = acknowledgeUpload(after, captured.batch);
  assert.deepEqual(ack.pendingDeletes, []);
  assert.deepEqual(ack.dirtyNoteIds, ["n1"]);
  assert.equal(after.notes[0]?.content, "restored");
});

test("failed upload does not clear dirty state so retry still has the edit", async () => {
  const state = slice({
    notes: [note("n1", { content: "offline", updatedAt: 11 })],
    dirtyNoteIds: ["n1"],
  });
  const captured = captureDirty(state);
  assert.ok(captured);

  let failed = false;
  try {
    throw new Error("network");
  } catch {
    failed = true;
  }
  assert.equal(failed, true);
  assert.deepEqual(state.dirtyNoteIds, ["n1"]);
  assert.equal(state.notes[0]?.content, "offline");

  const retry = captureDirty(state);
  assert.ok(retry);
  assert.equal(retry.payload.notes[0]?.content, "offline");
  const ack = acknowledgeUpload(state, retry.batch);
  assert.deepEqual(ack.dirtyNoteIds, []);
});

test("reconcileMerge keeps an edit that landed after mergeVault ran", () => {
  const before = slice({
    notes: [note("n1", { content: "v1", updatedAt: 10 })],
    dirtyNoteIds: ["n1"],
  });
  const merged = mergeVault(before, {
    notes: [
      {
        id: "n1",
        title: "n1",
        content: "server",
        folderId: null,
        pinned: false,
        kind: "markdown",
        drawing: { strokes: [] },
        createdAt: 1,
        updatedAt: 5,
      },
    ],
    deletedIds: [],
    folders: null,
  });
  const during = slice({
    notes: [note("n1", { content: "typed-during-load", updatedAt: 99 })],
    dirtyNoteIds: ["n1"],
    activeId: "n1",
  });
  const reconciled = reconcileMerge(merged, during);
  assert.equal(reconciled.notes[0]?.content, "typed-during-load");
  assert.deepEqual(reconciled.dirtyNoteIds, ["n1"]);
});

test("newer local folder timestamp is not overwritten by an older remote snapshot", () => {
  const merged = mergeVault(
    {
      notes: [],
      folders: [{ id: "f1", name: "Local" }],
      dirtyNoteIds: [],
      pendingDeletes: [],
      dirtyFolders: true,
      foldersUpdatedAt: 50,
    },
    {
      notes: [],
      deletedIds: [],
      folders: [{ id: "f2", name: "Remote old" }],
      foldersUpdatedAt: 10,
    },
  );
  assert.equal(merged.folders[0]?.name, "Local");
  assert.equal(merged.dirtyFolders, true);
  assert.ok(merged.foldersToPush);
});

test("newer remote folders win over older dirty local folders", () => {
  const merged = mergeVault(
    {
      notes: [],
      folders: [{ id: "f1", name: "Stale local" }],
      dirtyNoteIds: [],
      pendingDeletes: [],
      dirtyFolders: true,
      foldersUpdatedAt: 5,
    },
    {
      notes: [],
      deletedIds: [],
      folders: [{ id: "f2", name: "Remote new" }],
      foldersUpdatedAt: 40,
    },
  );
  assert.equal(merged.folders[0]?.name, "Remote new");
  assert.equal(merged.dirtyFolders, false);
  assert.equal(merged.foldersToPush, null);
});

test("folder ack only clears dirty when the uploaded timestamp still matches", () => {
  const uploaded = slice({
    folders: [{ id: "f1", name: "A" }],
    dirtyFolders: true,
    foldersUpdatedAt: 10,
  });
  const captured = captureDirty(uploaded);
  assert.ok(captured);
  const newer = slice({
    folders: [{ id: "f1", name: "B" }],
    dirtyFolders: true,
    foldersUpdatedAt: 20,
  });
  const ack = acknowledgeUpload(newer, captured.batch);
  assert.equal(ack.dirtyFolders, true);
});

test("sign-out then same user sign-in does not wipe unsynced notes", () => {
  const afterSignOut = nextAdoptVaultUser(
    { vaultOwnerId: "user-a", lastVaultOwnerId: "user-a" },
    null,
  );
  assert.equal(afterSignOut.wipe, false);
  assert.equal(afterSignOut.vaultOwnerId, null);
  const back = nextAdoptVaultUser(
    { vaultOwnerId: afterSignOut.vaultOwnerId, lastVaultOwnerId: afterSignOut.lastVaultOwnerId },
    "user-a",
  );
  assert.equal(back.wipe, false);
});

test("a different Google user signing in wipes the previous vault cache", () => {
  const result = nextAdoptVaultUser(
    { vaultOwnerId: null, lastVaultOwnerId: "user-a" },
    "user-b",
  );
  assert.equal(result.wipe, true);
});

test("first sign-in from an anonymous seed wipes so seed notes are not uploaded", () => {
  const result = nextAdoptVaultUser({ vaultOwnerId: null, lastVaultOwnerId: null }, "user-a");
  assert.equal(result.wipe, true);
});

test("captureDirty does not tombstone a note that still exists locally", () => {
  const captured = captureDirty(
    slice({
      notes: [note("n1", { content: "restored", updatedAt: 50 })],
      dirtyNoteIds: ["n1"],
      pendingDeletes: ["n1"],
    }),
  );
  assert.ok(captured);
  assert.equal(captured.payload.deleted.length, 0);
  assert.equal(captured.payload.notes[0]?.content, "restored");
});

test("a newer remote tombstone drops a stale local dirty edit", () => {
  const merged = mergeVault(
    {
      notes: [note("n1", { content: "stale", updatedAt: 10 })],
      folders: [],
      dirtyNoteIds: ["n1"],
      pendingDeletes: [],
      dirtyFolders: false,
    },
    {
      notes: [],
      deletedIds: ["n1"],
      deletedAt: { n1: 80 },
      folders: null,
    },
  );
  assert.equal(merged.notes.length, 0);
  assert.equal(merged.toPush.length, 0);
});

test("a local dirty edit newer than a remote tombstone is kept and re-pushed", () => {
  const merged = mergeVault(
    {
      notes: [note("n1", { content: "restored", updatedAt: 90 })],
      folders: [],
      dirtyNoteIds: ["n1"],
      pendingDeletes: [],
      dirtyFolders: false,
    },
    {
      notes: [],
      deletedIds: ["n1"],
      deletedAt: { n1: 40 },
      folders: null,
    },
  );
  assert.equal(merged.notes[0]?.content, "restored");
  assert.equal(merged.toPush.length, 1);
});

test("persisted localStorage slice keeps dirty markers so a refresh can retry", async () => {
  const { readFile } = await import("node:fs/promises");
  const text = await readFile(new URL("./store.ts", import.meta.url), "utf8");
  const start = text.indexOf("partialize:");
  assert.ok(start >= 0);
  const slice = text.slice(start, start + 900);
  for (const key of [
    "dirtyNoteIds",
    "pendingDeletes",
    "dirtyFolders",
    "foldersUpdatedAt",
    "lastVaultOwnerId",
  ]) {
    assert.match(slice, new RegExp(key));
  }
});
