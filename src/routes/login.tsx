import { createFileRoute, Link } from "@tanstack/react-router";
import { Cloud } from "lucide-react";
import { useEffect, useState } from "react";
import { AUTH_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { getAuthStatus } from "@/lib/auth/status";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { isPending } = useCurrentUserState();
  const [googleConfigured, setGoogleConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    void getAuthStatus()
      .then((status) => setGoogleConfigured(status.googleConfigured))
      .catch(() => setGoogleConfigured(authEnabled));
  }, []);

  const waiting = isPending || googleConfigured === null;

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 py-12 text-fg">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <p className="font-serif text-3xl font-medium tracking-tight">Vellum</p>
          <p className="text-sm leading-relaxed text-muted">
            {googleConfigured === false
              ? "Vellum still works without Google. Notes stay on this device until OAuth is configured."
              : "Sign in with Google to keep the same notes on your phone and computer. Folders, drawings, and links live in your Turso database — not in Drive."}
          </p>
        </div>

        {waiting ? (
          <div className="h-24 animate-pulse rounded-md bg-surface" />
        ) : (
          <>
            <SignedIn>
              <p className="text-sm text-muted">You are signed in. Notes are syncing to Turso.</p>
              <Link
                to="/"
                className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent text-sm font-medium text-accent-fg"
              >
                Open notes
              </Link>
            </SignedIn>
            <SignedOut>
              {authEnabled && googleConfigured ? (
                <div className="space-y-2">
                  {AUTH_PROVIDERS.map((provider) => (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => signIn(provider.id, { callbackURL: "/" })}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-surface text-sm text-fg hover:bg-surface-hover"
                    >
                      <Cloud className="size-4 text-subtle" />
                      Continue with {provider.label}
                    </button>
                  ))}
                </div>
              ) : authEnabled ? (
                <div className="space-y-3 rounded-md border border-border bg-surface px-4 py-3">
                  <p className="text-sm font-medium text-fg">Google sign-in isn’t set up here</p>
                  <p className="text-sm leading-relaxed text-muted">
                    Vellum is working. This local run has no Google OAuth credentials, so
                    notes stay on this device. That is expected for development — not a
                    broken app.
                  </p>
                  <p className="text-xs leading-relaxed text-subtle">
                    Production (Vercel) uses <code className="text-[0.7rem]">GOOGLE_CLIENT_ID</code> and{" "}
                    <code className="text-[0.7rem]">GOOGLE_CLIENT_SECRET</code>. See{" "}
                    <code className="text-[0.7rem]">.env.example</code>. Never put those values in source.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted">Sign-in is disabled.</p>
              )}
            </SignedOut>
          </>
        )}

        <p className="text-xs leading-relaxed text-subtle">
          {googleConfigured === false
            ? "Without Google OAuth, Vellum is not broken — notes simply remain in this browser."
            : "Without an account, notes stay on this device only. Sign-in uses your own Google Cloud OAuth client."}{" "}
          Redirect: <code className="text-[0.7rem]">/api/auth/callback/google</code>
        </p>
      </div>
    </main>
  );
}
