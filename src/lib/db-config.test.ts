import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveTursoConfig } from "./db-config.ts";

test("local processes without TURSO_* use a file database", () => {
  const config = resolveTursoConfig({});
  assert.equal(config.url, "file:.data/vellum.db");
  assert.equal(config.remote, false);
});

test("Vercel without a remote Turso URL throws", () => {
  assert.throws(() => resolveTursoConfig({ VERCEL: "1" }), /TURSO_DATABASE_URL/);
  assert.throws(
    () => resolveTursoConfig({ VERCEL: "1", TURSO_DATABASE_URL: "file:.data/vellum.db" }),
    /TURSO_DATABASE_URL/,
  );
});

test("Vercel with a libsql URL is remote", () => {
  const config = resolveTursoConfig({
    VERCEL: "1",
    TURSO_DATABASE_URL: "libsql://vellum-org.turso.io",
    TURSO_AUTH_TOKEN: "secret",
  });
  assert.equal(config.remote, true);
  assert.equal(config.authToken, "secret");
});
