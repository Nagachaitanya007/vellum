/** Turso / libSQL URL policy. Split from db.ts so it can be tested without Vite. */

export type LibsqlConfig = {
  url: string;
  authToken?: string;
  remote: boolean;
};

export function isRemoteUrl(url: string): boolean {
  return /^(libsql|https|http|wss|ws):/i.test(url);
}

function read(env: Record<string, string | undefined>, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

/**
 * Resolve the database target from env.
 * Vercel (and any `VERCEL=1` process) must use a remote Turso URL — a file
 * database is ephemeral on serverless and must not be a silent fallback.
 */
export function resolveTursoConfig(
  env: Record<string, string | undefined> = process.env,
): LibsqlConfig {
  const url = read(env, "TURSO_DATABASE_URL") ?? read(env, "LIBSQL_URL");
  const authToken = read(env, "TURSO_AUTH_TOKEN") ?? read(env, "LIBSQL_AUTH_TOKEN");
  const vercel = Boolean(read(env, "VERCEL"));

  if (vercel) {
    if (!url || !isRemoteUrl(url)) {
      throw new Error(
        "TURSO_DATABASE_URL is required in production. Create a Turso database and set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN (see .env.example).",
      );
    }
    return { url, authToken: authToken || undefined, remote: true };
  }

  if (url) {
    return { url, authToken: authToken || undefined, remote: isRemoteUrl(url) };
  }
  return { url: "file:.data/vellum.db", remote: false };
}
