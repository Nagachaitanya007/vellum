/**
 * Local email/password sign-in (this app's Better Auth DB).
 *
 * Off by default. Production uses Google OAuth. To enable: set
 * `emailAndPasswordEnabled` to `true` below, then build sign-up / sign-in
 * forms with `authClient.signUp.email` / `authClient.signIn.email`.
 */
export const emailAndPasswordEnabled = false;
