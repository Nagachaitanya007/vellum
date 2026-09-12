import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";
import {
  loadVaultForUser,
  parseSavePayload,
  saveVaultForUser,
  VAULT_LIMITS,
  VaultError,
  type QueryFn,
} from "./vault-ops.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

async function memoryQuery(): Promise<QueryFn> {
  const client = createClient({ url: ":memory:" });
  await client.execute(
    "create table if not exists _migrations (name text primary key, applied_at integer not null)",
  );
  const entries = await readdir(join(root, "migrations"));
  for (const { name } of pendingMigrations(entries, [])) {
    const text = await readFile(join(root, "migrations", name), "utf8");
    await client.executeMultiple(text);
  }
  return async (text, params = []) => {
    const result = await client.execute({ sql: text, args: params as never[] });
    return result.rows as never;
  };
}

function notePayload(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: extra.title ?? id,
    content: extra.content ?? "hello",
    folderId: extra.folderId ?? null,
    pinned: false,
    kind: extra.kind ?? "markdown",
    drawing: extra.drawing ?? { strokes: [] },
    createdAt: extra.createdAt ?? 1,
    updatedAt: extra.updatedAt ?? 1,
  };
}

test("parseSavePayload ignores a client-supplied userId", () => {
  const parsed = parseSavePayload({
    userId: "attacker",
    notes: [notePayload("n1")],
  });
  assert.equal("userId" in parsed, false);
  assert.equal(parsed.notes[0]?.id, "n1");
});

test("parseSavePayload rejects malformed ids and oversized content", () => {
  assert.throws(
    () => parseSavePayload({ notes: [{ ...notePayload("n1"), id: "../etc" }] }),
    VaultError,
  );
  assert.throws(
    () => parseSavePayload({ notes: [{ ...notePayload("n1"), id: "" }] }),
    VaultError,
  );
  assert.throws(
    () =>
      parseSavePayload({
        notes: [{ ...notePayload("n1"), content: "x".repeat(VAULT_LIMITS.maxContentLength + 1) }],
      }),
    VaultError,
  );
  assert.throws(
    () => parseSavePayload({ notes: new Array(VAULT_LIMITS.maxNotesPerSave + 1).fill(notePayload("n1")) }),
    VaultError,
  );
});

test("authenticated user can load and save their own notes", async () => {
  const query = await memoryQuery();
  const payload = parseSavePayload({ notes: [notePayload("n1", { title: "Mine", content: "body" })] });
  await saveVaultForUser(query, "user-a", payload);
  const loaded = await loadVaultForUser(query, "user-a");
  assert.equal(loaded.notes.length, 1);
  assert.equal(loaded.notes[0]?.title, "Mine");
});

test("user A cannot read user B notes or folders", async () => {
  const query = await memoryQuery();
  await saveVaultForUser(
    query,
    "user-b",
    parseSavePayload({
      notes: [notePayload("secret", { title: "B private", content: "nope" })],
      folders: [{ id: "fb", name: "B folder" }],
      foldersUpdatedAt: 10,
    }),
  );
  const a = await loadVaultForUser(query, "user-a");
  assert.equal(a.notes.length, 0);
  assert.equal(a.folders, null);
});

test("user A cannot create, update, or delete notes under user B", async () => {
  const query = await memoryQuery();
  await saveVaultForUser(
    query,
    "user-b",
    parseSavePayload({ notes: [notePayload("n1", { title: "Original B", updatedAt: 10 })] }),
  );
  await saveVaultForUser(
    query,
    "user-a",
    parseSavePayload({
      notes: [notePayload("n1", { title: "Hijack", content: "stolen", updatedAt: 999 })],
      deleted: [{ id: "n1", deletedAt: 1000 }],
    }),
  );
  const b = await loadVaultForUser(query, "user-b");
  assert.equal(b.notes.length, 1);
  assert.equal(b.notes[0]?.title, "Original B");
  assert.equal(b.deletedIds.length, 0);
  const a = await loadVaultForUser(query, "user-a");
  assert.equal(a.notes.length, 0);
  assert.equal(a.deletedIds.includes("n1"), true);
});

test("user A cannot read or modify user B folders", async () => {
  const query = await memoryQuery();
  await saveVaultForUser(
    query,
    "user-b",
    parseSavePayload({
      folders: [{ id: "fb", name: "B only" }],
      foldersUpdatedAt: 20,
    }),
  );
  await saveVaultForUser(
    query,
    "user-a",
    parseSavePayload({
      folders: [{ id: "fa", name: "A overwrite" }],
      foldersUpdatedAt: 99,
    }),
  );
  const b = await loadVaultForUser(query, "user-b");
  assert.deepEqual(b.folders, [{ id: "fb", name: "B only" }]);
  const a = await loadVaultForUser(query, "user-a");
  assert.deepEqual(a.folders, [{ id: "fa", name: "A overwrite" }]);
});

test("older folder save does not overwrite a newer one for the same user", async () => {
  const query = await memoryQuery();
  await saveVaultForUser(
    query,
    "user-a",
    parseSavePayload({
      folders: [{ id: "f1", name: "New" }],
      foldersUpdatedAt: 50,
    }),
  );
  await saveVaultForUser(
    query,
    "user-a",
    parseSavePayload({
      folders: [{ id: "f1", name: "Old" }],
      foldersUpdatedAt: 10,
    }),
  );
  const loaded = await loadVaultForUser(query, "user-a");
  assert.equal(loaded.folders?.[0]?.name, "New");
  assert.equal(loaded.foldersUpdatedAt, 50);
});

test("older note save does not overwrite a newer one for the same user", async () => {
  const query = await memoryQuery();
  await saveVaultForUser(
    query,
    "user-a",
    parseSavePayload({ notes: [notePayload("n1", { title: "New", updatedAt: 50 })] }),
  );
  await saveVaultForUser(
    query,
    "user-a",
    parseSavePayload({ notes: [notePayload("n1", { title: "Old", updatedAt: 10 })] }),
  );
  const loaded = await loadVaultForUser(query, "user-a");
  assert.equal(loaded.notes[0]?.title, "New");
});

test("loadVaultForUser without a matching user returns an empty vault", async () => {
  const query = await memoryQuery();
  const loaded = await loadVaultForUser(query, "nobody");
  assert.deepEqual(loaded.notes, []);
  assert.deepEqual(loaded.deletedIds, []);
  assert.equal(loaded.folders, null);
});
