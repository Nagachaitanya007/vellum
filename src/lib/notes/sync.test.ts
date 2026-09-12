import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeVault } from "./merge.ts";
import type { Note } from "./types";

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
