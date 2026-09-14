import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useActiveVault, useNotesStore } from "@/lib/notes/store";
import { PRIMARY_VAULT_ID } from "@/lib/notes/types";
import { useNotesUi } from "./notes-ui";

export function VaultDialog() {
  const vaults = useNotesStore((state) => state.vaults);
  const activeVaultId = useNotesStore((state) => state.activeVaultId);
  const createVault = useNotesStore((state) => state.createVault);
  const switchVault = useNotesStore((state) => state.switchVault);
  const renameVault = useNotesStore((state) => state.renameVault);
  const active = useActiveVault();
  const { vaultOpen, setVaultOpen } = useNotesUi();
  const [name, setName] = useState("");
  const [rename, setRename] = useState(active.name);

  function onCreate() {
    const id = createVault(name.trim() || "Untitled vault");
    setName("");
    setRename(useNotesStore.getState().vaults.find((vault) => vault.id === id)?.name ?? "Untitled vault");
    setVaultOpen(false);
  }

  function onSwitch(id: string) {
    switchVault(id);
    const next = useNotesStore.getState().vaults.find((vault) => vault.id === id);
    setRename(next?.name ?? "");
    setVaultOpen(false);
  }

  return (
    <Dialog
      open={vaultOpen}
      onOpenChange={(open) => {
        setVaultOpen(open);
        if (open) setRename(active.name);
      }}
    >
      <DialogContent>
        <DialogTitle>Vaults</DialogTitle>
        <DialogDescription>
          A vault is a workspace of notes and folders. Creating another one parks
          the current vault — it is not deleted. Only “{vaults.find((vault) => vault.id === PRIMARY_VAULT_ID)?.name ?? "My vault"}”
          syncs with Google when you sign in. Extra vaults stay on this device.
        </DialogDescription>

        <label className="mt-4 block text-sm text-muted">
          Active vault name
          <input
            value={rename}
            onChange={(event) => setRename(event.target.value)}
            onBlur={() => {
              if (rename.trim()) renameVault(active.id, rename);
            }}
            className="mt-1 h-11 w-full rounded-md bg-surface px-3 text-sm text-fg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </label>

        <ul className="mt-4 flex flex-col gap-1">
          {vaults.map((vault) => (
            <li key={vault.id}>
              <button
                type="button"
                onClick={() => onSwitch(vault.id)}
                className={`flex h-11 w-full items-center justify-between rounded-md px-3 text-left text-sm ${
                  vault.id === activeVaultId ? "bg-surface text-fg" : "text-muted hover:bg-surface-hover hover:text-fg"
                }`}
              >
                <span className="min-w-0 truncate">{vault.name}</span>
                <span className="shrink-0 text-xs text-subtle">
                  {vault.kind === "synced" ? "Syncs" : "This device"}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onCreate();
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name for a new vault"
            className="h-11 min-w-0 flex-1 rounded-md bg-surface px-3 text-sm text-fg placeholder:text-subtle outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
          <Button type="submit">New vault</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
