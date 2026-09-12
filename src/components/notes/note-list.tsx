import { LayoutList, Menu, Pin, Plus, Search, Table2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { displayTitle, extractTags, filterLabel, formatEdited, snippet } from "@/lib/notes/helpers";
import { useFolderName, useNotesStore } from "@/lib/notes/store";
import { cn, modLabel } from "@/lib/utils";
import { useNotesUi } from "./notes-ui";

export function NoteList() {
  const folders = useNotesStore((state) => state.folders);
  const filter = useNotesStore((state) => state.filter);
  const activeId = useNotesStore((state) => state.activeId);
  const selectNote = useNotesStore((state) => state.selectNote);
  const createNote = useNotesStore((state) => state.createNote);
  const listMode = useNotesStore((state) => state.listMode);
  const setListMode = useNotesStore((state) => state.setListMode);
  const { searchRef, titleRef, query, setQuery, filteredNotes, setSidebarOpen, layout } = useNotesUi();
  const [now, setNow] = useState(() => Date.now());
  const mod = modLabel();

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  function handleCreate() {
    createNote();
    setQuery("");
    setSidebarOpen(false);
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  function handleSelect(id: string) {
    selectNote(id);
    setSidebarOpen(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex items-center gap-2 px-3 pt-4 pb-2">
        {layout !== "desktop" ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open library"
            className={layout === "phone" ? "hidden" : undefined}
          >
            <Menu />
          </Button>
        ) : null}
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
          {filterLabel(filter, folders)}
        </p>
        <Hint label="List">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setListMode("list")}
            aria-label="List view"
            aria-pressed={listMode === "list"}
            className={listMode === "list" ? "text-fg" : undefined}
          >
            <LayoutList />
          </Button>
        </Hint>
        <Hint label="Table">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setListMode("table")}
            aria-label="Table view"
            aria-pressed={listMode === "table"}
            className={listMode === "table" ? "text-fg" : undefined}
          >
            <Table2 />
          </Button>
        </Hint>
        <Hint label="New note" shortcut={`${mod}N`}>
          <Button variant="ghost" size="icon-sm" onClick={handleCreate} aria-label="New note">
            <Plus />
          </Button>
        </Hint>
      </div>

      <div className="px-3 pb-2">
        <label className="relative block">
          <span className="sr-only">Search notes</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
          <input
            id="note-search"
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            autoComplete="off"
            className="h-11 w-full rounded-md bg-bg pr-3 pl-10 text-base text-fg placeholder:text-subtle outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:text-sm"
          />
        </label>
      </div>

      <nav className="scroll-thin min-h-0 flex-1 overflow-y-auto" aria-label="Notes">
        {filteredNotes.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-muted">
              {query.trim() ? "No notes match that search." : "Nothing in this list yet."}
            </p>
            {!query.trim() ? (
              <Button className="mt-4" size="sm" onClick={handleCreate}>
                New note
              </Button>
            ) : null}
          </div>
        ) : listMode === "table" ? (
          <div className="overflow-x-auto">
          <table className="w-full min-w-72 text-left text-sm">
            <thead className="sticky top-0 bg-surface text-xs tracking-wide text-subtle uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-2 py-2 font-medium">Folder</th>
                <th className="px-4 py-2 font-medium">Edited</th>
              </tr>
            </thead>
            <tbody>
              {filteredNotes.map((note) => {
                const active = note.id === activeId;
                return (
                  <TableRow
                    key={note.id}
                    active={active}
                    title={displayTitle(note.title)}
                    folderId={note.folderId}
                    tags={extractTags(note.content)}
                    edited={formatEdited(note.updatedAt, now)}
                    pinned={note.pinned}
                    onSelect={() => handleSelect(note.id)}
                  />
                );
              })}
            </tbody>
          </table>
          </div>
        ) : (
          <ul className="flex flex-col">
            {filteredNotes.map((note) => {
              const active = note.id === activeId;
              return (
                <li key={note.id} className="border-b border-border">
                  <button
                    type="button"
                    onClick={() => handleSelect(note.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "w-full px-4 py-3.5 text-left transition-[background-color] duration-quick ease-smooth",
                      "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent",
                      active ? "bg-bg" : "hover:bg-surface-hover",
                    )}
                  >
                    <span className="flex items-start gap-2">
                      {note.pinned ? (
                        <Pin className="mt-0.5 size-3.5 shrink-0 text-subtle" />
                      ) : null}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">
                          {displayTitle(note.title)}
                        </span>
                        <span className="mt-1 flex items-center gap-2 text-xs text-subtle">
                          <span className="shrink-0 tabular-nums">
                            {formatEdited(note.updatedAt, now)}
                          </span>
                          <span className="truncate">{snippet(note.content)}</span>
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </div>
  );
}

function TableRow({
  active,
  title,
  folderId,
  tags,
  edited,
  pinned,
  onSelect,
}: {
  active: boolean;
  title: string;
  folderId: string | null;
  tags: string[];
  edited: string;
  pinned: boolean;
  onSelect: () => void;
}) {
  const folder = useFolderName(folderId);
  return (
    <tr
      className={cn("cursor-pointer border-b border-border", active ? "bg-bg" : "hover:bg-surface-hover")}
      onClick={onSelect}
    >
      <td className="max-w-0 px-4 py-2">
        <span className="flex items-center gap-1.5 truncate font-medium text-fg">
          {pinned ? <Pin className="size-3 shrink-0 text-subtle" /> : null}
          {title}
        </span>
        {tags.length > 0 ? (
          <span className="truncate text-xs text-subtle">#{tags.slice(0, 2).join(" #")}</span>
        ) : null}
      </td>
      <td className="px-2 py-2 text-xs text-muted">{folder}</td>
      <td className="px-4 py-2 text-xs text-subtle tabular-nums">{edited}</td>
    </tr>
  );
}
