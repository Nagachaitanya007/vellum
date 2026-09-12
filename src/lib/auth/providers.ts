/**
 * Sign-in providers offered by this app.
 *
 * Production uses Better Auth's built-in Google social provider
 * (`socialProviders.google`) with credentials you own:
 * GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
 */
export type AuthProvider = {
  id: "google";
  label: string;
};

export const AUTH_PROVIDERS: readonly AuthProvider[] = [{ id: "google", label: "Google" }];
