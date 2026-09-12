import assert from "node:assert/strict";
import { test } from "node:test";
import { allowSharedDevUser } from "./dev-user.ts";
import { resolveTrustedOrigins, useSecureCookies } from "./origins.ts";
import { safeRedirectPath } from "./redirect.ts";

test("OAuth callback URLs must be same-origin relative paths", () => {
  assert.equal(safeRedirectPath("/"), "/");
  assert.equal(safeRedirectPath("/notes"), "/notes");
  assert.equal(safeRedirectPath("https://evil.example"), "/");
  assert.equal(safeRedirectPath("//evil.example"), "/");
  assert.equal(safeRedirectPath("/\\evil.example"), "/");
  assert.equal(safeRedirectPath("http://localhost:8080/"), "/");
  assert.equal(safeRedirectPath(undefined), "/");
});

test("production https origins do not trust localhost", () => {
  const origins = resolveTrustedOrigins(
    "https://vellum.example",
    ["http://localhost:8080", "http://127.0.0.1:8080"],
    ["*.grok-sandbox.com"],
  );
  assert.deepEqual(origins, ["https://vellum.example"]);
});

test("local BETTER_AUTH_URL still allows loopback origins", () => {
  const origins = resolveTrustedOrigins(
    "http://localhost:8080",
    ["http://localhost:8080", "http://127.0.0.1:8080"],
    ["*.grok-sandbox.com"],
  );
  assert.ok(origins.includes("http://localhost:8080"));
  assert.ok(origins.includes("http://127.0.0.1:8080"));
});

test("secure cookies are required on https and on Vercel", () => {
  assert.equal(useSecureCookies("https://vellum.example", false), true);
  assert.equal(useSecureCookies("http://localhost:8080", false), false);
  assert.equal(useSecureCookies(undefined, true), true);
});

test("shared dev-user is refused whenever auth, Turso, or Vercel is in play", () => {
  assert.equal(
    allowSharedDevUser({
      authConfigured: false,
      gateIdentityEnabled: false,
      remoteDatabase: false,
      vercel: false,
    }),
    true,
  );
  assert.equal(
    allowSharedDevUser({
      authConfigured: true,
      gateIdentityEnabled: false,
      remoteDatabase: false,
      vercel: false,
    }),
    false,
  );
  assert.equal(
    allowSharedDevUser({
      authConfigured: false,
      gateIdentityEnabled: false,
      remoteDatabase: true,
      vercel: false,
    }),
    false,
  );
  assert.equal(
    allowSharedDevUser({
      authConfigured: false,
      gateIdentityEnabled: false,
      remoteDatabase: false,
      vercel: true,
    }),
    false,
  );
});
