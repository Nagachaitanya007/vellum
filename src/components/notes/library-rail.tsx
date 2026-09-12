import {
  CalendarDays,
  Download,
  Folder,
  FolderPlus,
  Hash,
  Inbox,
  Moon,
  Network,
  Pin,
  StickyNote,
  Sun,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { AccountFooter } from "@/components/notes/account-sync";
import { Button } from "@/components/ui/button";
import { exportVaultZip } from "@/lib/notes/export";
import { allTags } from "@/lib/notes/helpers";
import { useNotesStore } from "@/lib/notes/store";
import { cn } from "@/lib/utils";

export function LibraryRail({
  onClose,
  compact = false,
}: {
  onClose?: () => void;
  compact?: boolean;
}) {
  const notes = useNotesStore((state) => state.notes);
  const folders = useNotesStore((state) => state.folders);
  const filter = useNotesStore((state) => state.filter);
  const setFilter = useNotesStore((state) => state.setFilter);
  const createFolder = useNotesStore((state) => state.createFolder);
  const deleteFolder = useNotesStore((state) => state.deleteFolder);
  const openDailyNote = useNotesStore((state) => state.openDailyNote);
  const workspace = useNotesStore((state) => state.workspace);
  const setWorkspace = useNotesStore((state) => state.setWorkspace);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const tags = allTags(notes);
  const pinnedCount = notes.filter((note) => note.pinned).length;
  const unfiledCount = notes.filter((note) => note.folderId === null).length;

  function select(next: Parameters<typeof setFilter>[0]) {
    setFilter(next);
  }

  function onAdd(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    createFolder(name);
    setName("");
    setAdding(false);
  }

  const smart = [
    {
      icon: StickyNote,
      label: "All Notes",
      count: notes.length,
      active: workspace === "notes" && filter.type === "all",
      onClick: () => select({ type: "all" as const }),
    },
    {
      icon: Pin,
      label: "Pinned",
      count: pinnedCount,
      active: workspace === "notes" && filter.type === "pinned",
      onClick: () => select({ type: "pinned" as const }),
    },
    {
      icon: CalendarDays,
      label: "Today",
      active: workspace === "notes" && filter.type === "daily",
      onClick: () => {
        openDailyNote();
        onClose?.();
      },
    },
    {
      icon: Inbox,
      label: "Unfiled",
      count: unfiledCount,
      active: workspace === "notes" && filter.type === "unfiled",
      onClick: () => select({ type: "unfiled" as const }),
    },
    {
      icon: Network,
      label: "Graph",
      active: workspace === "graph",
      onClick: () => {
        setWorkspace("graph");
        onClose?.();
      },
    },
  ];

  return (
    <div className={cn("flex min-h-0 flex-col bg-bg", compact ? "shrink-0" : "h-full")}>
      <div className={cn("flex items-center gap-2 px-4", compact ? "pt-3 pb-2" : "pt-5 pb-3")}>
        <div className="min-w-0 flex-1">
          <p className="font-serif text-lg font-medium tracking-tight text-fg">Vellum</p>
          {compact ? null : <p className="text-xs text-subtle">Notes + links</p>}
        </div>
        {onClose ? (
          <Button variant="quiet" size="icon" onClick={onClose} aria-label="Close library">
            <X />
          </Button>
        ) : null}
      </div>

      {compact ? (
        <nav className="scroll-thin flex gap-1 overflow-x-auto px-3 pb-3" aria-label="Library">
          {smart.map((item) => (
            <ChipButton key={item.label} {...item} />
          ))}
          {folders.map((folder) => (
            <ChipButton
              key={folder.id}
              icon={Folder}
              label={folder.name}
              count={notes.filter((note) => note.folderId === folder.id).length}
              active={workspace === "notes" && filter.type === "folder" && filter.id === folder.id}
              onClick={() => select({ type: "folder", id: folder.id })}
            />
          ))}
          {tags.map((tag) => (
            <ChipButton
              key={tag}
              icon={Hash}
              label={tag}
              active={workspace === "notes" && filter.type === "tag" && filter.tag === tag}
              onClick={() => select({ type: "tag", tag })}
            />
          ))}
        </nav>
      ) : (
        <>
          <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-4" aria-label="Library">
            {smart.map((item) => (
              <RailButton key={item.label} {...item} />
            ))}

            <div className="mt-4 mb-1 flex items-center justify-between px-3">
              <p className="text-xs font-medium tracking-wide text-subtle uppercase">Folders</p>
              <button
                type="button"
                className="inline-flex size-9 items-center justify-center rounded-sm text-subtle hover:bg-surface-hover hover:text-fg"
                aria-label="New folder"
                onClick={() => setAdding(true)}
              >
                <FolderPlus className="size-3.5" />
              </button>
            </div>
            {adding ? (
              <form onSubmit={onAdd} className="px-2 pb-1">
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onBlur={() => {
                    if (!name.trim()) setAdding(false);
                  }}
                  placeholder="Folder name"
                  className="h-11 w-full rounded-sm bg-surface px-3 text-base text-fg placeholder:text-subtle outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:h-9 md:text-sm"
                />
              </form>
            ) : null}
            {folders.map((folder) => {
              const count = notes.filter((note) => note.folderId === folder.id).length;
              return (
                <div key={folder.id} className="group relative">
                  <RailButton
                    icon={Folder}
                    label={folder.name}
                    count={count}
                    active={workspace === "notes" && filter.type === "folder" && filter.id === folder.id}
                    onClick={() => select({ type: "folder", id: folder.id })}
                  />
                  <button
                    type="button"
                    className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-sm text-subtle hover:bg-surface-hover hover:text-fg lg:opacity-0 lg:group-hover:opacity-100"
                    aria-label={`Delete ${folder.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteFolder(folder.id);
                    }}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })}

            {tags.length > 0 ? (
              <>
                <p className="mt-4 mb-1 px-3 text-xs font-medium tracking-wide text-subtle uppercase">
                  Tags
                </p>
                {tags.map((tag) => (
                  <RailButton
                    key={tag}
                    icon={Hash}
                    label={tag}
                    active={workspace === "notes" && filter.type === "tag" && filter.tag === tag}
                    onClick={() => select({ type: "tag", tag })}
                  />
                ))}
              </>
            ) : null}
          </nav>
          <LibraryFooter />
        </>
      )}
    </div>
  );
}

function RailButton({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: typeof StickyNote;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm transition-[background-color,color] duration-quick ease-smooth",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        active ? "bg-surface text-fg" : "text-muted hover:bg-surface-hover hover:text-fg",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === "number" ? (
        <span className="tabular-nums text-xs text-subtle">{count}</span>
      ) : null}
    </button>
  );
}

function ChipButton({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: typeof StickyNote;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm transition-[background-color,color] duration-quick ease-smooth",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        active ? "bg-surface text-fg" : "text-muted hover:bg-surface-hover hover:text-fg",
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span>{label}</span>
      {typeof count === "number" ? (
        <span className="tabular-nums text-xs text-subtle">{count}</span>
      ) : null}
    </button>
  );
}

export function LibraryFooter() {
  const notes = useNotesStore((state) => state.notes);
  const folders = useNotesStore((state) => state.folders);
  const theme = useNotesStore((state) => state.theme);
  const toggleTheme = useNotesStore((state) => state.toggleTheme);

  return (
    <div className="shrink-0 border-t border-border p-2">
      <AccountFooter />
      <button
        type="button"
        onClick={() => exportVaultZip(notes, folders)}
        className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-sm text-muted hover:bg-surface-hover hover:text-fg"
      >
        <Download className="size-4" />
        Download vault
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        className="flex h-11 w-full items-center gap-2 rounded-md px-3 text-sm text-muted hover:bg-surface-hover hover:text-fg"
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        {theme === "dark" ? "Light mode" : "Dark mode"}
      </button>
    </div>
  );
}
