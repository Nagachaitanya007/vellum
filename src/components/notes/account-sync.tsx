import { Link } from "@tanstack/react-router";
import { Cloud, CloudOff, LoaderCircle } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { authEnabled, signOut } from "@/lib/auth/client";
import { hasGateSessionMarker } from "@/lib/auth/gate-session-marker";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { flushVaultNow, startVaultSync, stopVaultSync } from "@/lib/notes/sync";
import { useNotesStore } from "@/lib/notes/store";
import type { SyncStatus } from "@/lib/notes/types";

const subscribeToNothing = () => () => {};
const noGateSessionOnServer = () => false;

function syncLabel(status: SyncStatus, lastSyncedAt: number | null): string {
  if (status === "syncing") return "Syncing…";
  if (status === "error") return "Couldn't sync";
  if (status === "synced") {
    if (!lastSyncedAt) return "Synced";
    const seconds = Math.max(0, Math.round((Date.now() - lastSyncedAt) / 1000));
    if (seconds < 8) return "Synced";
    if (seconds < 60) return `Synced ${seconds}s ago`;
    return "Synced";
  }
  return "On this device";
}

export function VaultSyncHost() {
  const { user, isPending } = useCurrentUserState();

  useEffect(() => {
    if (isPending) return;
    if (user && authEnabled) {
      useNotesStore.getState().adoptVaultUser(user.id);
      startVaultSync();
      const onVisible = () => {
        if (document.visibilityState === "visible") void flushVaultNow();
      };
      document.addEventListener("visibilitychange", onVisible);
      window.addEventListener("focus", onVisible);
      return () => {
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("focus", onVisible);
        stopVaultSync();
      };
    }
    stopVaultSync();
    useNotesStore.getState().adoptVaultUser(null);
  }, [user?.id, isPending]);

  return null;
}

export function AccountFooter() {
  const { user, isPending } = useCurrentUserState();
  const syncStatus = useNotesStore((state) => state.syncStatus);
  const lastSyncedAt = useNotesStore((state) => state.lastSyncedAt);
  const [signingOut, setSigningOut] = useState(false);
  const gateSession = useSyncExternalStore(
    subscribeToNothing,
    hasGateSessionMarker,
    noGateSessionOnServer,
  );

  if (isPending) {
    return <div className="mx-1 mb-1 h-14 animate-pulse rounded-md bg-surface" />;
  }

  if (!user) {
    return (
      <Link
        to="/login"
        className="flex items-start gap-2 rounded-md px-3 py-2 text-left text-sm text-muted hover:bg-surface-hover hover:text-fg"
      >
        <CloudOff className="mt-0.5 size-4 shrink-0" />
        <span className="min-w-0">
          <span className="block text-fg">Sign in to sync</span>
          <span className="block text-xs text-subtle">Phone and computer share one vault</span>
        </span>
      </Link>
    );
  }

  const Icon = syncStatus === "syncing" ? LoaderCircle : Cloud;
  const label = user.displayName ?? user.primaryEmail ?? "Signed in";

  return (
    <div className="rounded-md px-3 py-2">
      <div className="flex items-center gap-2">
        {user.profileImageUrl ? (
          <img
            src={user.profileImageUrl}
            alt=""
            className="size-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface text-xs font-medium text-fg">
            {label.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-fg">{label}</p>
          <p className="flex items-center gap-1 text-xs text-subtle">
            <Icon className={syncStatus === "syncing" ? "size-3 animate-spin" : "size-3"} />
            {syncLabel(syncStatus, lastSyncedAt)}
          </p>
        </div>
      </div>
      {authEnabled && !gateSession ? (
        <button
          type="button"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            void signOut().catch(() => setSigningOut(false));
          }}
          className="mt-2 h-9 w-full rounded-sm px-1 text-left text-xs text-muted hover:bg-surface-hover hover:text-fg"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
      ) : null}
    </div>
  );
}
