import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createClient, type Client, type InValue } from "@libsql/client";
import { pendingMigrations } from "../../scripts/migration-plan.mjs";
import { resolveTursoConfig, type LibsqlConfig } from "./db-config";

/** Which libSQL backend is active. */
export type DbSource = "turso" | "file";

export type { LibsqlConfig };

export function tursoConfig(): LibsqlConfig {
  return resolveTursoConfig(process.env);
}

export function isRemoteDatabase(): boolean {
  try {
    return tursoConfig().remote;
  } catch {
    return false;
  }
}

export const dbSource: DbSource = (() => {
  try {
    return tursoConfig().remote ? "turso" : "file";
  } catch {
    return "file";
  }
})();

export interface Sql {
  <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

const globalRef = globalThis as typeof globalThis & {
  __libsqlClientPromise__?: Promise<Client>;
  __libsqlMigrateChain__?: Promise<void>;
  __libsqlSqlPromise__?: Promise<Sql>;
};

function toPositional(text: string): string {
  return text.replace(/\$(\d+)/g, "?");
}

function toSql(run: <T>(text: string, params: InValue[]) => Promise<T[]>): Sql {
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    let text = strings[0];
    for (let i = 0; i < values.length; i += 1) text += `?${strings[i + 1]}`;
    return run<T>(text, values as InValue[]);
  }) as unknown as Sql;
  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(toPositional(text), params as InValue[]);
  return sql;
}

function ensureFileDir(url: string) {
  if (!url.startsWith("file:")) return;
  const path = url.slice("file:".length);
  if (!path || path === ":memory:" || path.startsWith(":memory:")) return;
  const dir = dirname(path);
  if (dir && dir !== ".") mkdirSync(dir, { recursive: true });
}

export async function getLibsql(): Promise<Client> {
  globalRef.__libsqlClientPromise__ ??= (async () => {
    const config = tursoConfig();
    ensureFileDir(config.url);
    const client = createClient({
      url: config.url,
      authToken: config.authToken,
    });
    await client.execute(
      "create table if not exists _migrations (name text primary key, applied_at integer not null)",
    );
    return client;
  })().catch((err) => {
    globalRef.__libsqlClientPromise__ = undefined;
    throw err;
  });
  return globalRef.__libsqlClientPromise__;
}

async function applyMigrations(client: Client): Promise<void> {
  const migrations = import.meta.glob("/migrations/*.sql", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const doneRows = await client.execute("select name from _migrations");
  const done = doneRows.rows.map((row) => String(row.name));
  for (const { name, path } of pendingMigrations(Object.keys(migrations), done)) {
    const text = migrations[path];
    if (!text) continue;
    await client.executeMultiple(text);
    await client.execute({
      sql: "insert into _migrations (name, applied_at) values (?, ?)",
      args: [name, Date.now()],
    });
  }
}

async function createSql(): Promise<Sql> {
  if (typeof window !== "undefined") {
    throw new Error(
      "@/lib/db is server-only — call getSql() from a createServerFn handler " +
        "or a server route loader, never from client code.",
    );
  }
  const client = await getLibsql();
  const pass = (globalRef.__libsqlMigrateChain__ ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => applyMigrations(client));
  globalRef.__libsqlMigrateChain__ = pass;
  await pass;
  return toSql(async <T>(text: string, params: InValue[]) => {
    const result = await client.execute({ sql: text, args: params });
    return result.rows as T[];
  });
}

export function getSql(): Promise<Sql> {
  globalRef.__libsqlSqlPromise__ ??= createSql().catch((err) => {
    globalRef.__libsqlSqlPromise__ = undefined;
    throw err;
  });
  return globalRef.__libsqlSqlPromise__;
}

/** Run write statements in a single libSQL transaction (all succeed or all roll back). */
export async function executeWriteBatch(
  statements: Array<{ sql: string; args: unknown[] }>,
): Promise<void> {
  if (statements.length === 0) return;
  const client = await getLibsql();
  await client.batch(
    statements.map((item) => ({
      sql: toPositional(item.sql),
      args: item.args as InValue[],
    })),
    "write",
  );
}


export function ensureDbReady(): Promise<void> {
  return getSql().then(() => undefined);
}

const globalBoot = globalThis as typeof globalThis & {
  __libsqlBootstrapPromise__?: Promise<void>;
};
if (typeof window === "undefined") {
  globalBoot.__libsqlBootstrapPromise__ ??= ensureDbReady().catch((err) => {
    globalBoot.__libsqlBootstrapPromise__ = undefined;
    console.error("[db] libSQL bootstrap failed:", err instanceof Error ? err.message : err);
    throw err;
  });
}
