import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { pendingMigrations } from "../../../scripts/migration-plan.mjs";
import {
  buildSaveStatements,
  loadVaultForUser,
  parseSavePayload,
  publicErrorMessage,
  saveVaultForUser,
  VAULT_LIMITS,
  VaultError,
  type BatchFn,
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

async function memoryDb(): Promise<{ query: QueryFn; batch: BatchFn; client: ReturnType<typeof createClient> }> {
  const client = createClient({ url: ":memory:" });
  await client.execute(
    "create table if not exists _migrations (name text primary key, applied_at integer not null)",
  );
  const entries = await readdir(join(root, "migrations"));
  for (const { name } of pendingMigrations(entries, [])) {
    const text = await readFile(join(root, "migrations", name), "utf8");
    await client.executeMultiple(text);
  }
  const query: QueryFn = async (text, params = []) => {
    const result = await client.execute({ sql: text, args: params as never[] });
    return result.rows as never;
  };
  const batch: BatchFn = async (statements) => {
    await client.batch(
      statements.map((item) => ({ sql: item.sql, args: item.args as never[] })),
      "write",
    );
  };
  return { query, batch, client };
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
  assert.deepEqual(loaded.deletedAt, {});
  assert.equal(loaded.folders, null);
});

test("a stale tombstone does not delete a newer live note for the same user", async () => {
  const query = await memoryQuery();
  await saveVaultForUser(
    query,
    "user-a",
    parseSavePayload({ notes: [notePayload("n1", { title: "Newest", updatedAt: 80 })] }),
  );
  await saveVaultForUser(
    query,
    "user-a",
    parseSavePayload({ deleted: [{ id: "n1", deletedAt: 20 }] }),
  );
  const loaded = await loadVaultForUser(query, "user-a");
  assert.equal(loaded.notes.length, 1);
  assert.equal(loaded.notes[0]?.title, "Newest");
  assert.equal(loaded.deletedIds.length, 0);
});

test("a newer tombstone still deletes an older live note for the same user", async () => {
  const query = await memoryQuery();
  await saveVaultForUser(
    query,
    "user-a",
    parseSavePayload({ notes: [notePayload("n1", { title: "Old", updatedAt: 10 })] }),
  );
  await saveVaultForUser(
    query,
    "user-a",
    parseSavePayload({ deleted: [{ id: "n1", deletedAt: 40 }] }),
  );
  const loaded = await loadVaultForUser(query, "user-a");
  assert.equal(loaded.notes.length, 0);
  assert.equal(loaded.deletedIds.includes("n1"), true);
  assert.equal(loaded.deletedAt.n1, 40);
});

test("parseSavePayload rejects wrong primitive types instead of coercing them", () => {
  assert.throws(
    () => parseSavePayload({ notes: [{ ...notePayload("n1"), pinned: "false" }] }),
    VaultError,
  );
  assert.throws(
    () => parseSavePayload({ notes: [{ ...notePayload("n1"), pinned: 0 }] }),
    VaultError,
  );
  assert.throws(
    () => parseSavePayload({ notes: [{ ...notePayload("n1"), kind: "page" }] }),
    VaultError,
  );
  assert.throws(
    () => parseSavePayload({ notes: [{ ...notePayload("n1"), title: 12 }] }),
    VaultError,
  );
  assert.throws(
    () => parseSavePayload({ notes: [{ ...notePayload("n1"), folderId: "" }] }),
    VaultError,
  );
  assert.throws(
    () => parseSavePayload({ notes: [{ ...notePayload("n1"), createdAt: "1" }] }),
    VaultError,
  );
  assert.throws(
    () => parseSavePayload({ notes: [{ ...notePayload("n1"), updatedAt: 1.5 }] }),
    VaultError,
  );
  assert.throws(
    () => parseSavePayload({ deleted: [{ id: "n1" }] }),
    VaultError,
  );
  assert.throws(
    () => parseSavePayload({ deleted: [{ id: "n1", deletedAt: "10" }] }),
    VaultError,
  );
  assert.throws(
    () => parseSavePayload({ folders: [{ id: "f1", name: "X" }] }),
    VaultError,
  );
  assert.throws(() => parseSavePayload({ notes: "[]" }), VaultError);
  assert.throws(() => parseSavePayload(null), VaultError);
  assert.throws(() => parseSavePayload([]), VaultError);
});

test("saveVaultForUser applies a mixed batch in one transactional call", async () => {
  const { query, batch } = await memoryDb();
  let calls = 0;
  const counted: BatchFn = async (statements) => {
    calls += 1;
    await batch(statements);
  };
  await saveVaultForUser(
    query,
    "user-a",
    parseSavePayload({
      notes: [notePayload("n1"), notePayload("n2")],
      deleted: [{ id: "n3", deletedAt: 3 }],
      folders: [{ id: "f1", name: "Desk" }],
      foldersUpdatedAt: 4,
    }),
    counted,
  );
  assert.equal(calls, 1);
  const loaded = await loadVaultForUser(query, "user-a");
  assert.equal(loaded.notes.length, 2);
  assert.equal(loaded.deletedIds.includes("n3"), true);
  assert.equal(loaded.folders?.[0]?.name, "Desk");
});

test("a failed statement in a batch rolls back earlier writes", async () => {
  const { query, client } = await memoryDb();
  const payload = parseSavePayload({
    notes: [notePayload("n1", { title: "Keep" }), notePayload("n2", { title: "Drop" })],
  });
  const statements = buildSaveStatements("user-a", payload);
  await assert.rejects(() =>
    client.batch(
      [
        ...statements.map((item) => ({ sql: item.sql, args: item.args as never[] })),
        { sql: "insert into __no_such_table (x) values (1)" },
      ],
      "write",
    ),
  );
  const loaded = await loadVaultForUser(query, "user-a");
  assert.equal(loaded.notes.length, 0);
});

test("retry after a rolled-back batch is idempotent and succeeds", async () => {
  const { query, batch, client } = await memoryDb();
  const payload = parseSavePayload({
    notes: [notePayload("n1", { title: "Retry", content: "body", updatedAt: 5 })],
  });
  const statements = buildSaveStatements("user-a", payload);
  await assert.rejects(() =>
    client.batch(
      [
        ...statements.map((item) => ({ sql: item.sql, args: item.args as never[] })),
        { sql: "insert into __no_such_table (x) values (1)" },
      ],
      "write",
    ),
  );
  await saveVaultForUser(query, "user-a", payload, batch);
  await saveVaultForUser(query, "user-a", payload, batch);
  const loaded = await loadVaultForUser(query, "user-a");
  assert.equal(loaded.notes.length, 1);
  assert.equal(loaded.notes[0]?.title, "Retry");
  assert.equal(loaded.notes[0]?.updatedAt, 5);
});

test("publicErrorMessage does not leak SQL or other-user details", () => {
  assert.deepEqual(publicErrorMessage(new Error("SQLITE_ERROR: no such table notes")), {
    message: "Couldn't save notes",
    status: 500,
  });
  assert.deepEqual(publicErrorMessage(new VaultError("Invalid pinned")), {
    message: "Invalid pinned",
    status: 400,
  });
});
