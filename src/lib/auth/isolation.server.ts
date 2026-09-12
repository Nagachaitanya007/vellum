import { getRequest } from "@tanstack/react-start/server";
import { evaluateRequestIsolation } from "./origins.ts";

/**
 * Fetch-Metadata sibling isolation — **server-only** (`.server.ts` suffix).
 *
 * MUST keep the `.server` suffix: this file imports `@tanstack/react-start/server`
 * (`getRequest` → Node `AsyncLocalStorage`). If it is imported from a dual
 * client/server module under a non-`.server` name, Vite ships it to the browser
 * and the app dies with: `AsyncLocalStorage is not a constructor`.
 *
 * We allow only: same-origin requests (this app's own client), non-browser
 * requests (SSR / server-to-server, which send no `Sec-Fetch-Site`), and
 * top-level GET navigations (how the Google OAuth callback and normal page
 * loads arrive). Every cross-site / same-site *scripted* request is rejected.
 * Together with Better Auth's `trustedOrigins`, this is enforced at the
 * `authMiddleware` chokepoint (see `middleware.ts`).
 */
export class CrossSiteRequestError extends Error {
  readonly status = 403;
  constructor() {
    super("Forbidden: cross-site request blocked");
    this.name = "CrossSiteRequestError";
  }
}

/** Throw `CrossSiteRequestError` for a scripted cross-site/sibling request. */
export function assertSameSiteRequest(): void {
  const request = getRequest();
  if (!request) return; // no request context (e.g. build) — nothing to guard
  const h = request.headers;
  const decision = evaluateRequestIsolation({
    method: request.method,
    url: request.url,
    secFetchSite: h.get("sec-fetch-site"),
    secFetchMode: h.get("sec-fetch-mode"),
    secFetchDest: h.get("sec-fetch-dest"),
    origin: h.get("origin"),
  });
  if (decision === "forbid") throw new CrossSiteRequestError();
}
