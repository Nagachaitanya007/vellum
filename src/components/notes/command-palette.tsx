import { Command } from "cmdk";
import {
  CalendarDays,
  Cloud,
  Eye,
  FilePlus,
  Folder,
  FolderPlus,
  Hash,
  Moon,
  Network,
  PenTool,
  Pin,
  Search,
  StickyNote,
  Sun,
  Table2,
} from "lucide-react";
import { allTags, displayTitle } from "@/lib/notes/helpers";
import { flushVaultNow } from "@/lib/notes/sync";
import { useNotesStore } from "@/lib/notes/store";
import { useNotesUi } from "./notes-ui";

export function CommandPalette() {
  const notes = useNotesStore((state) => state.notes);
  const folders = useNotesStore((state) => state.folders);
  const createNote = useNotesStore((state) => state.createNote);
  const createFolder = useNotesStore((state) => state.createFolder);
  const selectNote = useNotesStore((state) => state.selectNote);
  const setFilter = useNotesStore((state) => state.setFilter);
  const openDailyNote = useNotesStore((state) => state.openDailyNote);
  const togglePin = useNotesStore((state) => state.togglePin);
  const cyclePreviewMode = useNotesStore((state) => state.cyclePreviewMode);
  const toggleGraph = useNotesStore((state) => state.toggleGraph);
  const setWorkspace = useNotesStore((state) => state.setWorkspace);
  const setPreviewMode = useNotesStore((state) => state.setPreviewMode);
  const toggleTheme = useNotesStore((state) => state.toggleTheme);
  const theme = useNotesStore((state) => state.theme);
  const setListMode = useNotesStore((state) => state.setListMode);
  const activeId = useNotesStore((state) => state.activeId);
  const { paletteOpen, setPaletteOpen, titleRef, isDesktop, setSidebarOpen, setFindOpen, setReplaceOpen } =
    useNotesUi();
  const tags = allTags(notes);

  function close() {
    setPaletteOpen(false);
  }

  return (
    <Command.Dialog
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      label="Command palette"
      loop
      overlayClassName="fixed inset-0 z-50 bg-bg/70"
      contentClassName="fixed top-[18vh] left-1/2 z-50 w-[min(32rem,calc(100vw-1.5rem))] -translate-x-1/2 overflow-hidden rounded-xl bg-raised text-fg shadow-border"
    >
      <div className="flex items-center gap-2 border-b border-border px-3">
        <Search className="size-4 text-subtle" />
        <Command.Input placeholder="Search notes or run a command…" className="cmdk-input" />
      </div>
      <Command.List className="cmdk-list scroll-thin">
        <Command.Empty className="cmdk-empty">No matching notes or commands.</Command.Empty>
        <Command.Group heading="Commands">
          <Command.Item
            value="new note"
            className="cmdk-item"
            onSelect={() => {
              createNote();
              close();
              requestAnimationFrame(() => titleRef.current?.focus());
            }}
          >
            <FilePlus className="size-4 text-subtle" />
            New note
          </Command.Item>
          <Command.Item
            value="daily note today"
            className="cmdk-item"
            onSelect={() => {
              openDailyNote();
              close();
              setSidebarOpen(false);
            }}
          >
            <CalendarDays className="size-4 text-subtle" />
            Open today
          </Command.Item>
          <Command.Item
            value="vault graph"
            className="cmdk-item"
            onSelect={() => {
              setWorkspace("graph");
              close();
              setSidebarOpen(false);
            }}
          >
            <Network className="size-4 text-subtle" />
            Vault graph
          </Command.Item>
          <Command.Item
            value="draw canvas sketch"
            className="cmdk-item"
            onSelect={() => {
              setWorkspace("notes");
              setPreviewMode("draw");
              close();
              setSidebarOpen(false);
            }}
          >
            <PenTool className="size-4 text-subtle" />
            Draw
          </Command.Item>
          <Command.Item
            value="meeting notes template"
            className="cmdk-item"
            onSelect={() => {
              createNote({
                title: "Meeting",
                content:
                  "## Agenda\n\n- [ ] \n\n## Notes\n\n\n## Next\n\n- [ ] \n",
              });
              close();
              requestAnimationFrame(() => titleRef.current?.focus());
            }}
          >
            <FilePlus className="size-4 text-subtle" />
            New from template · Meeting
          </Command.Item>
          <Command.Item
            value="sync vault now cloud"
            className="cmdk-item"
            onSelect={() => {
              void flushVaultNow();
              close();
            }}
          >
            <Cloud className="size-4 text-subtle" />
            Sync now
          </Command.Item>
          <Command.Item
            value="toggle theme light dark"
            className="cmdk-item"
            onSelect={() => {
              toggleTheme();
              close();
            }}
          >
            {theme === "dark" ? <Sun className="size-4 text-subtle" /> : <Moon className="size-4 text-subtle" />}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </Command.Item>
          <Command.Item
            value="find replace in note"
            className="cmdk-item"
            onSelect={() => {
              setFindOpen(true);
              setReplaceOpen(true);
              close();
            }}
          >
            <Search className="size-4 text-subtle" />
            Find and replace
          </Command.Item>
          <Command.Item
            value="table view database"
            className="cmdk-item"
            onSelect={() => {
              setListMode("table");
              setWorkspace("notes");
              close();
            }}
          >
            <Table2 className="size-4 text-subtle" />
            Table view
          </Command.Item>
          <Command.Item
            value="all notes library"
            className="cmdk-item"
            onSelect={() => {
              setFilter({ type: "all" });
              close();
            }}
          >
            <StickyNote className="size-4 text-subtle" />
            All notes
          </Command.Item>
          <Command.Item
            value="new folder"
            className="cmdk-item"
            onSelect={() => {
              createFolder(`Folder ${folders.length + 1}`);
              close();
            }}
          >
            <FolderPlus className="size-4 text-subtle" />
            New folder
          </Command.Item>
          <Command.Item
            value="pin note"
            className="cmdk-item"
            onSelect={() => {
              if (activeId) togglePin(activeId);
              close();
            }}
          >
            <Pin className="size-4 text-subtle" />
            Pin or unpin
          </Command.Item>
          <Command.Item
            value="toggle preview"
            className="cmdk-item"
            onSelect={() => {
              cyclePreviewMode(isDesktop);
              close();
            }}
          >
            <Eye className="size-4 text-subtle" />
            Cycle preview
          </Command.Item>
          <Command.Item
            value="local graph"
            className="cmdk-item"
            onSelect={() => {
              toggleGraph();
              close();
            }}
          >
            <Network className="size-4 text-subtle" />
            Toggle local graph
          </Command.Item>
        </Command.Group>
        {folders.length > 0 ? (
          <Command.Group heading="Folders">
            {folders.map((folder) => (
              <Command.Item
                key={folder.id}
                value={`folder ${folder.name}`}
                className="cmdk-item"
                onSelect={() => {
                  setFilter({ type: "folder", id: folder.id });
                  close();
                }}
              >
                <Folder className="size-4 text-subtle" />
                <span className="min-w-0 truncate">{folder.name}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
        {tags.length > 0 ? (
          <Command.Group heading="Tags">
            {tags.map((tag) => (
              <Command.Item
                key={tag}
                value={`tag ${tag}`}
                className="cmdk-item"
                onSelect={() => {
                  setFilter({ type: "tag", tag });
                  close();
                }}
              >
                <Hash className="size-4 text-subtle" />
                <span className="min-w-0 truncate">#{tag}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
        <Command.Group heading="Notes">
          {notes.map((note) => (
            <Command.Item
              key={note.id}
              value={`note ${displayTitle(note.title)} ${note.content.slice(0, 80)}`}
              className="cmdk-item"
              onSelect={() => {
                selectNote(note.id);
                close();
                setSidebarOpen(false);
              }}
            >
              <span className="min-w-0 truncate">{displayTitle(note.title)}</span>
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
