#!/usr/bin/env node
/**
 * Deploy-time database migrator (Turso / libSQL).
 *
 * Runs during `npm run build` when TURSO_DATABASE_URL is set — applying pending
 * files in ../migrations. Each file is applied once and recorded in `_migrations`.
 *
 * No Turso URL (local / preview builds) -> skip; `src/lib/db.ts` applies the
 * same files on startup against the local file database.
 *
 * Loads a local `.env` if present so `npm run db:migrate` works after
 * `cp .env.example .env`. Existing process.env values always win.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@libsql/client";
import { pendingMigrations } from "./migration-plan.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadDotEnv(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv(join(root, ".env"));

const databaseUrl = (process.env.TURSO_DATABASE_URL ?? process.env.LIBSQL_URL ?? "").trim();
const authToken = (process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN ?? "").trim();

if (!databaseUrl) {
  console.log(
    "[migrate] TURSO_DATABASE_URL not set — skipping (local file DB migrates itself on startup).",
  );
  process.exit(0);
}

const migrationsDir = join(root, "migrations");

function ensureFileDir(url) {
  if (!url.startsWith("file:")) return;
  const path = url.slice("file:".length);
  if (!path || path.startsWith(":memory:")) return;
  const dir = dirname(path);
  if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
}

async function main() {
  let entries;
  try {
    entries = await readdir(migrationsDir);
  } catch {
    console.log("[migrate] no migrations/ directory — nothing to do.");
    return;
  }
  if (pendingMigrations(entries, []).length === 0) {
    console.log("[migrate] no migrations — nothing to do.");
    return;
  }

  ensureFileDir(databaseUrl);
  const client = createClient({
    url: databaseUrl,
    authToken: authToken || undefined,
  });

  await client.execute(
    "create table if not exists _migrations (name text primary key, applied_at integer not null)",
  );
  const applied = (await client.execute("select name from _migrations")).rows.map((row) =>
    String(row.name),
  );

  let count = 0;
  for (const { name } of pendingMigrations(entries, applied)) {
    const text = await readFile(join(migrationsDir, name), "utf8");
    try {
      await client.executeMultiple(text);
      await client.execute({
        sql: "insert into _migrations (name, applied_at) values (?, ?)",
        args: [name, Date.now()],
      });
    } catch (err) {
      console.error(`[migrate] error applying ${name}`);
      throw err;
    }
    console.log(`[migrate] applied ${name}`);
    count += 1;
  }
  console.log(count ? `[migrate] done — ${count} migration(s) applied.` : "[migrate] up to date.");
  client.close();
}

main().catch((err) => {
  console.error("[migrate] failed:", err?.message || err);
  process.exit(1);
});
