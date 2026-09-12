/** Cookie / CSRF origin policy for standalone Better Auth. */

export function resolveTrustedOrigins(
  explicitBaseURL: string | undefined,
  localDev: string[],
  previewHosts: string[],
): string[] {
  if (!explicitBaseURL) {
    return [
      ...previewHosts,
      ...previewHosts.flatMap((host) => [`https://${host}`, `http://${host}`]),
      ...localDev,
    ];
  }
  const origins = [explicitBaseURL];
  try {
    const host = new URL(explicitBaseURL).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
      for (const item of localDev) {
        if (!origins.includes(item)) origins.push(item);
      }
    }
  } catch {
    /* ignore invalid URL */
  }
  return origins;
}

export function useSecureCookies(explicitBaseURL: string | undefined, vercel: boolean): boolean {
  if (explicitBaseURL?.startsWith("https://")) return true;
  if (vercel && !explicitBaseURL?.startsWith("http://")) return true;
  return false;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export type IsolationHeaders = {
  method: string;
  url: string;
  secFetchSite: string | null;
  secFetchMode: string | null;
  secFetchDest: string | null;
  origin: string | null;
};

function isTopLevelGetNavigation(req: IsolationHeaders): boolean {
  return (
    req.secFetchMode === "navigate" &&
    req.method.toUpperCase() === "GET" &&
    req.secFetchDest !== "object" &&
    req.secFetchDest !== "embed"
  );
}

function originConflicts(req: IsolationHeaders): boolean {
  const origin = req.origin;
  if (!origin || origin === "null") return false;
  try {
    const from = new URL(origin);
    const to = new URL(req.url);
    if (from.origin === to.origin) return false;
    const fromHost = from.hostname.toLowerCase();
    const toHost = to.hostname.toLowerCase();
    if (LOOPBACK_HOSTS.has(fromHost) && LOOPBACK_HOSTS.has(toHost) && from.protocol === to.protocol) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Same-origin + CSRF policy for vault server functions.
 * Allows non-browser callers (no Sec-Fetch-Site / Origin), same-origin fetches,
 * and top-level GET navigations (OAuth callback). Blocks cross-site scripted
 * requests, including older browsers that omit Sec-Fetch-Site but send Origin.
 */
export function evaluateRequestIsolation(req: IsolationHeaders): "allow" | "forbid" {
  if (isTopLevelGetNavigation(req)) return "allow";
  const site = req.secFetchSite;
  if (site === "same-origin" || site === "none") return "allow";
  if (site) return "forbid";
  if (originConflicts(req)) return "forbid";
  return "allow";
}
