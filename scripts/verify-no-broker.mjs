#!/usr/bin/env node
/**
 * Production auth/db source must not call a third-party auth broker or use
 * Postgres/PGLite. Google OAuth goes through Better Auth on this app.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "src/lib/auth/server.ts",
  "src/lib/auth/providers.ts",
  "src/lib/auth/client.ts",
  "src/lib/auth/popup.server.ts",
  "src/lib/db.ts",
  "src/lib/notes/api.ts",
  "scripts/migrate.mjs",
];

const forbidden = [
  /auth\.grok\.me/,
  /GROK_AUTH_/,
  /GROK_ISSUER/,
  /PREVIEW_CLIENT_(ID|SECRET)/,
  /genericOAuth/,
  /grok-google/,
  /@electric-sql\/pglite/,
  /from ["']pg["']/,
];

let failed = 0;
for (const rel of files) {
  const text = readFileSync(join(root, rel), "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      console.error(`[verify-no-broker] ${rel} matches ${pattern}`);
      failed += 1;
    }
  }
}

function walkJs(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walkJs(full, acc);
    else if (/\.(js|mjs|cjs)$/.test(name)) acc.push(full);
  }
  return acc;
}

for (const bundleDir of ["dist/client", ".output/public"]) {
  for (const file of walkJs(join(root, bundleDir))) {
    const text = readFileSync(file, "utf8");
    if (text.includes("auth.grok.me") || text.includes("GROK_AUTH_")) {
      console.error(`[verify-no-broker] client bundle ${file} contains broker strings`);
      failed += 1;
    }
  }
}

if (failed) {
  process.exit(1);
}
console.log(
  "[verify-no-broker] ok — production auth/db files do not reference a Grok broker or PGLite/pg",
);
