import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { exportScope, type ExportScope } from "@/lib/notes/export";
import { displayTitle, filterLabel } from "@/lib/notes/helpers";
import { useActiveNote, useActiveVault, useNotesStore } from "@/lib/notes/store";
import { useNotesUi } from "./notes-ui";

export function ExportDialog() {
  const notes = useNotesStore((state) => state.notes);
  const folders = useNotesStore((state) => state.folders);
  const filter = useNotesStore((state) => state.filter);
  const active = useActiveNote();
  const vault = useActiveVault();
  const { exportOpen, setExportOpen } = useNotesUi();
  const folderScope =
    filter.type === "folder" ? filter.id : active?.folderId ?? null;
  const [mode, setMode] = useState<"vault" | "folder" | "notes" | "note">("vault");
  const [picked, setPicked] = useState<string[]>(active ? [active.id] : []);

  const folderName =
    folderScope === null
      ? "Unfiled"
      : (folders.find((folder) => folder.id === folderScope)?.name ?? "Folder");

  const folderNotes = useMemo(
    () => notes.filter((note) => note.folderId === folderScope),
    [notes, folderScope],
  );

  function toggle(id: string) {
    setPicked((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function run() {
    const scope: ExportScope =
      mode === "vault"
        ? { type: "vault" }
        : mode === "folder"
          ? { type: "folder", folderId: folderScope }
          : mode === "note"
            ? { type: "note", id: active?.id ?? "" }
            : { type: "notes", ids: picked };
    exportScope(notes, folders, scope, { vaultName: vault.name });
    setExportOpen(false);
  }

  const canRun =
    mode === "vault" ||
    mode === "folder" ||
    (mode === "note" && Boolean(active)) ||
    (mode === "notes" && picked.length > 0);

  return (
    <Dialog open={exportOpen} onOpenChange={setExportOpen}>
      <DialogContent className="max-h-[min(36rem,calc(100dvh-2rem))] overflow-y-auto">
        <DialogTitle>Export</DialogTitle>
        <DialogDescription>
          Download a copy of “{vault.name}”. This file is not the live vault — notes
          on this device stay where they are.
        </DialogDescription>
        <div className="mt-4 flex flex-col gap-2">
          <ScopeOption
            checked={mode === "vault"}
            onChange={() => setMode("vault")}
            label="Entire vault"
            hint={`${notes.length} notes`}
          />
          <ScopeOption
            checked={mode === "folder"}
            onChange={() => setMode("folder")}
            label={`Folder · ${folderName}`}
            hint={`${folderNotes.length} notes`}
          />
          <ScopeOption
            checked={mode === "note"}
            onChange={() => setMode("note")}
            label="This note"
            hint={active ? displayTitle(active.title) : "None open"}
            disabled={!active}
          />
          <ScopeOption
            checked={mode === "notes"}
            onChange={() => {
              setMode("notes");
              if (picked.length === 0 && active) setPicked([active.id]);
            }}
            label="Selected notes"
            hint={`${picked.length} selected`}
          />
        </div>
        {mode === "notes" ? (
          <ul className="mt-3 max-h-48 overflow-y-auto rounded-md border border-border">
            {notes.map((note) => (
              <li key={note.id} className="border-b border-border last:border-b-0">
                <label className="flex h-11 cursor-pointer items-center gap-2 px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={picked.includes(note.id)}
                    onChange={() => toggle(note.id)}
                    className="size-4 accent-current"
                  />
                  <span className="min-w-0 truncate">{displayTitle(note.title)}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-3 text-xs text-subtle">
          Current list: {filterLabel(filter, folders)}. Markdown, folders, wiki links, and
          note metadata are kept in the download.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setExportOpen(false)}>
            Cancel
          </Button>
          <Button onClick={run} disabled={!canRun}>
            Download
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScopeOption({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 ${
        checked ? "border-accent bg-surface" : "border-border"
      } ${disabled ? "opacity-40" : ""}`}
    >
      <input
        type="radio"
        name="export-scope"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="mt-1 size-4 accent-current"
      />
      <span>
        <span className="block text-sm text-fg">{label}</span>
        <span className="block text-xs text-subtle">{hint}</span>
      </span>
    </label>
  );
}
