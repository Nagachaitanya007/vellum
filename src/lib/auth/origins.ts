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
