/**
 * Only same-origin relative paths are allowed as OAuth callback URLs.
 * Rejects protocol-relative (`//evil.com`), schemes, and backslash tricks.
 */
export function safeRedirectPath(url: string | undefined | null): string {
  if (!url || typeof url !== "string") return "/";
  const trimmed = url.trim();
  if (!trimmed.startsWith("/")) return "/";
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return "/";
  if (/^[\\/]+[\\/]/.test(trimmed)) return "/";
  if (trimmed.includes("://") || trimmed.includes("\\")) return "/";
  return trimmed;
}
