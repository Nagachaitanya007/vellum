/**
 * Vellum Better Auth — standalone Google OAuth + Turso/libSQL.
 *
 * Production (no Grok required):
 *   Google OAuth → this app's session cookie on BETTER_AUTH_URL
 *   → authenticated user id → Turso
 *
 * Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, BETTER_AUTH_SECRET,
 * BETTER_AUTH_URL, TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (see .env.example).
 *
 * Optional preview extras (gate identity + bearer) are enabled only when this
 * process is NOT a standalone production origin. They never contact an
 * external auth broker.
 */
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getCookie } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { ensureDbReady, getLibsql } from "../db";
import { emailAndPasswordEnabled } from "./email-password";
import { GATE_PROVIDER_ID, gateIdentitySessions } from "./gate-session.server";
import { libsqlDialect } from "./libsql-dialect";
import { resolveTrustedOrigins, useSecureCookies } from "./origins";

void ensureDbReady();

const globalAuthRef = globalThis as typeof globalThis & {
  __vellumAuthSecret__?: string;
};
function devAuthSecret(): string {
  globalAuthRef.__vellumAuthSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__vellumAuthSecret__;
}

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

const authDisabled = env("VITE_AUTH_ENABLED") === "false";
const googleClientId = env("GOOGLE_CLIENT_ID");
const googleClientSecret = env("GOOGLE_CLIENT_SECRET");

/** True when Google OAuth is configured for this process. */
export const googleAuthConfigured = Boolean(googleClientId && googleClientSecret);

/** True when federated sign-in is active (real auth is enforced). */
export const authConfigured = !authDisabled && googleAuthConfigured;

const explicitBaseURL = env("BETTER_AUTH_URL") ?? env("VELLUM_URL");
const LOCAL_DEV_ORIGINS: string[] = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
];
/** Optional live-preview hosts — never contacted; only accepted as this app's origin. */
const OPTIONAL_PREVIEW_HOSTS = ["*.grok-sandbox.com"];

function isPreviewHost(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith(".grok-sandbox.com") || host.endsWith(".grok.me");
  } catch {
    return false;
  }
}

/**
 * Gate-identity + bearer exist only for the Grok live-preview iframe.
 * Standalone production (BETTER_AUTH_URL on your own domain) is cookie + Google.
 */
const previewExtrasEnabled = !explicitBaseURL || isPreviewHost(explicitBaseURL);

if (env("VERCEL") && !env("BETTER_AUTH_SECRET")) {
  throw new Error(
    "BETTER_AUTH_SECRET is required in production. Generate one with: openssl rand -base64 32",
  );
}

const baseURL = explicitBaseURL ?? {
  allowedHosts: [...OPTIONAL_PREVIEW_HOSTS, "localhost", "127.0.0.1", "[::1]"],
  protocol: "auto" as const,
  fallback: "http://localhost:8080",
};

const trustedOrigins: string[] = resolveTrustedOrigins(
  explicitBaseURL,
  LOCAL_DEV_ORIGINS,
  OPTIONAL_PREVIEW_HOSTS,
);

const secureCookies = useSecureCookies(explicitBaseURL, Boolean(env("VERCEL")));

const database = {
  dialect: libsqlDialect(() => getLibsql()),
  type: "sqlite" as const,
};

/** Session token cookie name — also read by the live-preview popup completion page. */
export const SESSION_TOKEN_COOKIE = "vellum.session_token";

export const auth = betterAuth({
  baseURL,
  secret: env("BETTER_AUTH_SECRET") ?? devAuthSecret(),
  database,
  trustedOrigins,
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: previewExtrasEnabled
        ? ["google", GATE_PROVIDER_ID]
        : ["google"],
      requireLocalEmailVerified: false,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 300 },
  },
  ...(emailAndPasswordEnabled ? { emailAndPassword: { enabled: true } } : {}),
  ...(googleAuthConfigured
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId as string,
            clientSecret: googleClientSecret as string,
            prompt: "select_account",
            accessType: "offline",
          },
        },
      }
    : {}),
  advanced: {
    useSecureCookies: secureCookies,
    cookiePrefix: "vellum",
    defaultCookieAttributes: {
      secure: secureCookies,
      sameSite: "lax",
      path: "/",
    },
    cookies: {
      session_token: { name: SESSION_TOKEN_COOKIE },
      session_data: { name: "vellum.session_data" },
      account_data: { name: "vellum.account_data" },
      dont_remember: { name: "vellum.dont_remember" },
    },
  },
  plugins: [
    ...(previewExtrasEnabled ? [gateIdentitySessions(), bearer()] : []),
    tanstackStartCookies(),
  ],
});

export function readSessionToken(): string | null {
  return getCookie(SESSION_TOKEN_COOKIE) ?? null;
}
