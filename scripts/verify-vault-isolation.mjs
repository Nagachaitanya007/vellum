#!/usr/bin/env node
/**
 * Verifies the Turso/libSQL vault schema, per-user isolation, and last-write-wins
 * against an in-memory database — no Grok, no network, no Google.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { pendingMigrations } from "./migration-plan.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "migrations");

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

async function applySchema(client) {
  await client.execute(
    "create table if not exists _migrations (name text primary key, applied_at integer not null)",
  );
  const entries = (await import("node:fs/promises")).readdir
    ? await (await import("node:fs/promises")).readdir(migrationsDir)
    : [];
  const applied = [];
  for (const { name } of pendingMigrations(entries, applied)) {
    const text = await readFile(join(migrationsDir, name), "utf8");
    await client.executeMultiple(text);
    await client.execute({
      sql: "insert into _migrations (name, applied_at) values (?, ?)",
      args: [name, Date.now()],
    });
  }
}

async function main() {
  const client = createClient({ url: ":memory:" });
  await applySchema(client);

  const userA = "user-a-google";
  const userB = "user-b-google";
  const now = Date.now();

  await client.execute({
    sql: `insert into notes (id, user_id, title, content, folder_id, pinned, kind, drawing, created_at, updated_at, deleted_at)
          values (?, ?, ?, ?, null, 0, 'markdown', '{"strokes":[]}', ?, ?, null)`,
    args: ["note-1", userA, "From A", "hello from device A", now, now],
  });
  await client.execute({
    sql: `insert into notes (id, user_id, title, content, folder_id, pinned, kind, drawing, created_at, updated_at, deleted_at)
          values (?, ?, ?, ?, null, 0, 'markdown', '{"strokes":[]}', ?, ?, null)`,
    args: ["note-1", userB, "From B", "should never leak", now, now],
  });

  const aRows = await client.execute({
    sql: "select id, title, content from notes where user_id = ? and deleted_at is null",
    args: [userA],
  });
  const bRows = await client.execute({
    sql: "select id, title, content from notes where user_id = ? and deleted_at is null",
    args: [userB],
  });
  assert(aRows.rows.length === 1, "user A should see one note");
  assert(bRows.rows.length === 1, "user B should see one note");
  assert(aRows.rows[0].title === "From A", "user A title");
  assert(bRows.rows[0].title === "From B", "user B must not see user A's title");
  assert(aRows.rows[0].content !== bRows.rows[0].content, "contents stay isolated");

  const later = now + 1000;
  await client.execute({
    sql: `update notes set title = ?, content = ?, updated_at = ?
          where user_id = ? and id = ? and updated_at <= ?`,
    args: ["From A edited on B", "edited", later, userA, "note-1", later],
  });
  const after = await client.execute({
    sql: "select title, content from notes where user_id = ? and id = ?",
    args: [userA, "note-1"],
  });
  assert(after.rows[0].title === "From A edited on B", "last write should win for owner");

  const bStill = await client.execute({
    sql: "select title from notes where user_id = ? and id = ?",
    args: [userB, "note-1"],
  });
  assert(bStill.rows[0].title === "From B", "editing A must not change B");

  await client.execute({
    sql: `insert into notes (id, user_id, title, content, folder_id, pinned, kind, drawing, created_at, updated_at, deleted_at)
          values (?, ?, '', '', null, 0, 'markdown', '{"strokes":[]}', ?, ?, ?)
          on conflict (user_id, id) do update set deleted_at = excluded.deleted_at, updated_at = excluded.updated_at`,
    args: ["note-1", userA, later + 1, later + 1, later + 1],
  });
  const deleted = await client.execute({
    sql: "select id from notes where user_id = ? and deleted_at is null",
    args: [userA],
  });
  assert(deleted.rows.length === 0, "deleted notes are hidden for the owner");
  const bAlive = await client.execute({
    sql: "select id from notes where user_id = ? and deleted_at is null",
    args: [userB],
  });
  assert(bAlive.rows.length === 1, "delete A must not delete B");

  console.log("[verify-vault] ok — schema, isolation, last-write-wins, delete");
  client.close();
}

main().catch((err) => {
  console.error("[verify-vault] failed:", err);
  process.exit(1);
});
