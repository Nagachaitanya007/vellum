import assert from "node:assert/strict";
import { test } from "node:test";
import { closeTab, openTab, pruneTabs } from "./helpers.ts";
import { notesForExport } from "./export.ts";
import type { Note } from "./types.ts";

function note(id: string, folderId: string | null = null): Note {
  return {
    id,
    title: id,
    content: "body",
    folderId,
    pinned: false,
    kind: "markdown",
    drawing: { strokes: [] },
    createdAt: 1,
    updatedAt: 1,
  };
}

test("export scopes pick the whole vault, a folder, or specific notes", () => {
  const notes = [note("a", "f1"), note("b", "f1"), note("c", null)];
  assert.equal(notesForExport(notes, { type: "vault" }).length, 3);
  assert.deepEqual(
    notesForExport(notes, { type: "folder", folderId: "f1" }).map((item) => item.id),
    ["a", "b"],
  );
  assert.deepEqual(
    notesForExport(notes, { type: "notes", ids: ["c", "a"] }).map((item) => item.id),
    ["a", "c"],
  );
  assert.equal(notesForExport(notes, { type: "note", id: "b" })[0]?.id, "b");
});

test("opening a note twice does not duplicate its tab", () => {
  const once = openTab([], "n1");
  const twice = openTab(once, "n1");
  assert.deepEqual(once, ["n1"]);
  assert.equal(twice, once);
});

test("closing a tab activates a neighbor instead of dropping the editor", () => {
  const closed = closeTab(["a", "b", "c"], "b", "b");
  assert.deepEqual(closed.ids, ["a", "c"]);
  assert.equal(closed.activeId, "c");
  const last = closeTab(["a"], "a", "a");
  assert.deepEqual(last.ids, []);
  assert.equal(last.activeId, null);
});

test("pruneTabs drops deleted notes and keeps the active note", () => {
  assert.deepEqual(pruneTabs(["gone", "kept"], new Set(["kept"]), "kept"), ["kept"]);
});
