/**
 * The shared `dev-user` is local-only, and only when federated auth is off.
 * Production, Vercel, and any remote Turso database must never use it.
 */
export function allowSharedDevUser(opts: {
  authConfigured: boolean;
  gateIdentityEnabled: boolean;
  remoteDatabase: boolean;
  vercel: boolean;
}): boolean {
  if (opts.authConfigured || opts.gateIdentityEnabled) return false;
  if (opts.remoteDatabase || opts.vercel) return false;
  return true;
}
