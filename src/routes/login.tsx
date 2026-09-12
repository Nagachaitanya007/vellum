import { createFileRoute, Link } from "@tanstack/react-router";
import { Cloud } from "lucide-react";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const { isPending } = useCurrentUserState();

  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 py-12 text-fg">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2">
          <p className="font-serif text-3xl font-medium tracking-tight">Vellum</p>
          <p className="text-sm leading-relaxed text-muted">
            Sign in to keep the same notes on your phone and computer. Folders,
            drawings, and links travel with your account.
          </p>
        </div>

        {isPending ? (
          <div className="h-24 animate-pulse rounded-md bg-surface" />
        ) : (
          <>
            <SignedIn>
              <p className="text-sm text-muted">You are signed in. Notes are syncing.</p>
              <Link
                to="/"
                className="inline-flex h-11 w-full items-center justify-center rounded-md bg-accent text-sm font-medium text-accent-fg"
              >
                Open notes
              </Link>
            </SignedIn>
            <SignedOut>
              {authEnabled ? (
                <div className="space-y-2">
                  {GROK_PROVIDERS.map((provider) => (
                    <button
                      key={provider.providerId}
                      type="button"
                      onClick={() => signIn(provider.providerId, { callbackURL: "/" })}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-surface text-sm text-fg hover:bg-surface-hover"
                    >
                      <Cloud className="size-4 text-subtle" />
                      Continue with {provider.label}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">Sign-in is disabled.</p>
              )}
            </SignedOut>
          </>
        )}

        <p className="text-xs leading-relaxed text-subtle">
          Without an account, notes stay on this device only.
        </p>
      </div>
    </main>
  );
}
