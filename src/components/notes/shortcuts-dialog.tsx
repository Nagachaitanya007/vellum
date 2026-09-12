import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { altLabel, modLabel } from "@/lib/utils";
import { useNotesUi } from "./notes-ui";

export function ShortcutsDialog() {
  const { helpOpen, setHelpOpen, isDesktop } = useNotesUi();
  const mod = modLabel();
  const alt = altLabel();

  const rows = [
    { keys: `${mod}N`, action: "New note" },
    { keys: `${mod}P`, action: "Command palette" },
    { keys: `${mod}K`, action: "Search the list" },
    { keys: `${mod}F`, action: "Find in note" },
    { keys: `${mod}H`, action: "Find and replace" },
    { keys: `${mod}S`, action: "Save" },
    { keys: `${mod}⇧G`, action: "Vault graph" },
    { keys: `${mod}⇧L`, action: "Light / dark" },
    { keys: `${mod}⇧D`, action: "Today’s daily note" },
    { keys: `${mod}⇧P`, action: "Pin or unpin" },
    { keys: `${mod}E`, action: "Cycle preview" },
    { keys: `${mod}⇧⌫`, action: "Delete note" },
    { keys: `${alt}↑ / ${alt}↓`, action: "Previous / next note" },
    { keys: "[[", action: "Link to a note" },
    { keys: "/", action: "Insert a block" },
    { keys: `${mod}B / ${mod}I`, action: "Bold / italic" },
    { keys: `${mod}/`, action: "Keyboard shortcuts" },
  ];

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent>
        <DialogTitle>Keyboard</DialogTitle>
        <DialogDescription className="mt-1">
          {isDesktop
            ? "Notes, graph, find, and draw. Shortcuts work from anywhere except a dialog."
            : "Search, folders, and the toolbar cover most of it on a phone."}
        </DialogDescription>
        <ul className="mt-5 max-h-80 divide-y divide-border overflow-y-auto">
          {rows.map((row) => (
            <li key={row.action} className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-sm text-fg">{row.action}</span>
              <kbd className="font-sans text-xs tracking-wide text-muted">{row.keys}</kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
