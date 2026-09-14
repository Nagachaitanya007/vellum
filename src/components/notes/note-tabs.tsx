import { X } from "lucide-react";
import { displayTitle } from "@/lib/notes/helpers";
import { useNotesStore } from "@/lib/notes/store";
import { cn } from "@/lib/utils";

export function NoteTabs() {
  const notes = useNotesStore((state) => state.notes);
  const openTabIds = useNotesStore((state) => state.openTabIds);
  const activeId = useNotesStore((state) => state.activeId);
  const selectNote = useNotesStore((state) => state.selectNote);
  const closeNoteTab = useNotesStore((state) => state.closeNoteTab);

  const tabs = openTabIds
    .map((id) => notes.find((note) => note.id === id))
    .filter((note): note is NonNullable<typeof note> => Boolean(note));

  if (tabs.length === 0) return null;

  return (
    <div
      className="scroll-thin flex h-11 shrink-0 items-stretch gap-px overflow-x-auto border-b border-paper-line bg-paper"
      role="tablist"
      aria-label="Open notes"
    >
      {tabs.map((note) => {
        const selected = note.id === activeId;
        return (
          <div
            key={note.id}
            className={cn(
              "group flex min-w-0 max-w-48 shrink-0 items-center border-r border-paper-line",
              selected ? "bg-paper" : "bg-paper/60",
            )}
          >
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => selectNote(note.id)}
              className={cn(
                "min-w-0 flex-1 truncate px-3 py-2 text-left text-sm",
                selected ? "text-paper-fg" : "text-paper-muted hover:text-paper-fg",
              )}
            >
              {displayTitle(note.title)}
            </button>
            <button
              type="button"
              className={cn(
                "mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-sm text-paper-subtle hover:bg-paper-hover hover:text-paper-fg",
                selected ? "opacity-100" : "opacity-80 lg:opacity-0 lg:group-hover:opacity-100",
              )}
              aria-label={`Close ${displayTitle(note.title)}`}
              onClick={(event) => {
                event.stopPropagation();
                closeNoteTab(note.id);
              }}
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
