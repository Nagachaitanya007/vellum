import { Menu, Plus, Search } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { CommandPalette } from "@/components/notes/command-palette";
import { VaultSyncHost } from "@/components/notes/account-sync";
import { DeleteDialog } from "@/components/notes/delete-dialog";
import { EditorPane } from "@/components/notes/editor-pane";
import { LibraryFooter, LibraryRail } from "@/components/notes/library-rail";
import { NoteList } from "@/components/notes/note-list";
import { NewNoteDialog } from "@/components/notes/new-note-dialog";
import { ShortcutsDialog } from "@/components/notes/shortcuts-dialog";
import { VaultGraph } from "@/components/notes/vault-graph";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { displayTitle } from "@/lib/notes/helpers";
import {
  applyTheme,
  hydrateNotesFromStorage,
  useActiveNote,
  useNotesStore,
} from "@/lib/notes/store";
import { flushVaultNow } from "@/lib/notes/sync";
import { NotesUiProvider, useNotesUi, type ShellLayout } from "./notes-ui";

function revealNotes() {
  hydrateNotesFromStorage();
}

function layoutFromWidth(): ShellLayout {
  if (window.matchMedia("(min-width: 1024px)").matches) return "desktop";
  if (window.matchMedia("(min-width: 768px)").matches) return "tablet";
  return "phone";
}

function syncAppHeight() {
  const height = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${Math.round(height)}px`);
}

export function AppShell() {
  const hasHydrated = useNotesStore((state) => state.hasHydrated);
  const theme = useNotesStore((state) => state.theme);
  const [layout, setLayout] = useState<ShellLayout | null>(null);

  useLayoutEffect(() => {
    setLayout(layoutFromWidth());
    syncAppHeight();
    hydrateNotesFromStorage();
  }, []);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const update = () => setLayout(layoutFromWidth());
    const desktop = window.matchMedia("(min-width: 1024px)");
    const tablet = window.matchMedia("(min-width: 768px)");
    desktop.addEventListener("change", update);
    tablet.addEventListener("change", update);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", syncAppHeight);
    viewport?.addEventListener("scroll", syncAppHeight);
    window.addEventListener("resize", syncAppHeight);
    try {
      void useNotesStore.persist.rehydrate();
    } catch {
      revealNotes();
    }
    return () => {
      desktop.removeEventListener("change", update);
      tablet.removeEventListener("change", update);
      viewport?.removeEventListener("resize", syncAppHeight);
      viewport?.removeEventListener("scroll", syncAppHeight);
      window.removeEventListener("resize", syncAppHeight);
    };
  }, []);

  if (!hasHydrated || layout === null) {
    return <ShellSkeleton />;
  }

  return (
    <TooltipProvider>
      <NotesUiProvider layout={layout}>
        <VaultSyncHost />
        <KeyboardBindings />
        {layout === "desktop" ? (
          <DesktopLayout />
        ) : layout === "tablet" ? (
          <TabletLayout />
        ) : (
          <MobileLayout />
        )}
        <DeleteDialog />
        <NewNoteDialog />
        <ShortcutsDialog />
        <CommandPalette />
      </NotesUiProvider>
    </TooltipProvider>
  );
}

function DesktopLayout() {
  const workspace = useNotesStore((state) => state.workspace);
  return (
    <div className="app-frame overflow-hidden">
      <Group orientation="horizontal" className="h-full">
        <Panel defaultSize={200} minSize={168} maxSize={280} className="min-h-0">
          <LibraryRail />
        </Panel>
        <Separator className="w-1 bg-border hover:bg-subtle/40" />
        {workspace === "graph" ? (
          <Panel minSize={360} className="min-h-0">
            <VaultGraph />
          </Panel>
        ) : (
          <>
            <Panel defaultSize={280} minSize={220} maxSize={480} className="min-h-0">
              <NoteList />
            </Panel>
            <Separator className="w-1 bg-border hover:bg-subtle/40" />
            <Panel minSize={360} className="min-h-0">
              <EditorPane />
            </Panel>
          </>
        )}
      </Group>
    </div>
  );
}

function TabletLayout() {
  const workspace = useNotesStore((state) => state.workspace);
  const { sidebarOpen, setSidebarOpen } = useNotesUi();

  return (
    <div className="app-frame flex overflow-hidden">
      {workspace === "graph" ? (
        <div className="min-h-0 min-w-0 flex-1">
          <VaultGraph />
        </div>
      ) : (
        <Group orientation="horizontal" className="h-full min-w-0 flex-1">
          <Panel defaultSize={280} minSize={220} maxSize={360} className="min-h-0">
            <NoteList />
          </Panel>
          <Separator className="w-1 bg-border hover:bg-subtle/40" />
          <Panel minSize={320} className="min-h-0">
            <EditorPane />
          </Panel>
        </Group>
      )}
      {sidebarOpen ? <LibraryDrawer open onClose={() => setSidebarOpen(false)} wide /> : null}
    </div>
  );
}

function MobileLayout() {
  const active = useActiveNote();
  const workspace = useNotesStore((state) => state.workspace);
  const { sidebarOpen, setSidebarOpen, titleRef, setPaletteOpen, setNewNoteOpen } = useNotesUi();

  function handleCreate() {
    setNewNoteOpen(true);
  }

  return (
    <div className="app-frame flex flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-bg px-2">
        <Button
          variant="quiet"
          size="icon"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open notes library"
        >
          <Menu />
        </Button>
        <p className="min-w-0 flex-1 truncate px-1 font-serif text-base text-fg">
          {workspace === "graph" ? "Graph" : active ? displayTitle(active.title) : "Vellum"}
        </p>
        <Button
          variant="quiet"
          size="icon"
          onClick={() => setPaletteOpen(true)}
          aria-label="Search and commands"
        >
          <Search />
        </Button>
        <Button variant="quiet" size="icon" onClick={handleCreate} aria-label="New note">
          <Plus />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {workspace === "graph" ? <VaultGraph /> : <EditorPane />}
      </div>

      {sidebarOpen ? <LibraryDrawer open onClose={() => setSidebarOpen(false)} /> : null}
    </div>
  );
}

function LibraryDrawer({
  open,
  onClose,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className={open ? "fixed inset-0 z-40" : "pointer-events-none fixed inset-0 z-40"}>
      <button
        type="button"
        aria-label="Dismiss library"
        onClick={onClose}
        tabIndex={open ? 0 : -1}
        className="absolute inset-0 bg-bg/70 transition-opacity duration-fast ease-smooth"
        style={{ opacity: open ? 1 : 0 }}
      />
      <aside
        aria-hidden={!open}
        className="absolute inset-y-0 left-0 flex w-full border-r border-border bg-bg shadow-border transition-transform duration-fast ease-smooth will-change-transform"
        style={{
          transform: open ? "translateX(0)" : "translateX(-110%)",
          maxWidth: wide ? "28rem" : undefined,
        }}
      >
        {wide ? (
          <>
            <div className="flex w-48 shrink-0 flex-col border-r border-border">
              <LibraryRail onClose={onClose} />
            </div>
            <div className="min-w-0 flex-1">
              <NoteList />
            </div>
          </>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <LibraryRail onClose={onClose} compact />
            <div className="min-h-0 flex-1 border-t border-border">
              <NoteList />
            </div>
            <LibraryFooter />
          </div>
        )}
      </aside>
    </div>
  );
}

function KeyboardBindings() {
  const cyclePreviewMode = useNotesStore((state) => state.cyclePreviewMode);
  const selectAdjacent = useNotesStore((state) => state.selectAdjacent);
  const openDailyNote = useNotesStore((state) => state.openDailyNote);
  const togglePin = useNotesStore((state) => state.togglePin);
  const toggleTheme = useNotesStore((state) => state.toggleTheme);
  const setWorkspace = useNotesStore((state) => state.setWorkspace);
  const workspace = useNotesStore((state) => state.workspace);
  const activeId = useNotesStore((state) => state.activeId);
  const {
    searchRef,
    titleRef,
    editorRef,
    setSidebarOpen,
    setDeleteOpen,
    setHelpOpen,
    setPaletteOpen,
    setQuery,
    setFindOpen,
    setReplaceOpen,
    findOpen,
    flashSave,
    filteredNotes,
    isDesktop,
    deleteOpen,
    helpOpen,
    paletteOpen,
    query,
    setNewNoteOpen,
  } = useNotesUi();
  const filteredNotesRef = useRef(filteredNotes);
  filteredNotesRef.current = filteredNotes;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key;
      if (deleteOpen || helpOpen || paletteOpen) {
        if (key === "Escape") {
          setHelpOpen(false);
          setDeleteOpen(false);
          setPaletteOpen(false);
        }
        return;
      }

      const meta = event.metaKey || event.ctrlKey;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const inField =
        tag === "INPUT" || tag === "TEXTAREA" || Boolean(target?.isContentEditable);
      const inSearch = target === searchRef.current;
      const ids = filteredNotesRef.current.map((note) => note.id);

      if (meta && key.toLowerCase() === "s") {
        event.preventDefault();
        flashSave();
        void flushVaultNow();
        return;
      }

      if (meta && key.toLowerCase() === "f") {
        event.preventDefault();
        setFindOpen(true);
        if (event.shiftKey) setReplaceOpen(true);
        return;
      }

      if (meta && key.toLowerCase() === "h") {
        event.preventDefault();
        setFindOpen(true);
        setReplaceOpen(true);
        return;
      }

      if (meta && event.shiftKey && key.toLowerCase() === "g") {
        event.preventDefault();
        setWorkspace(workspace === "graph" ? "notes" : "graph");
        return;
      }

      if (meta && event.shiftKey && key.toLowerCase() === "l") {
        event.preventDefault();
        toggleTheme();
        return;
      }

      if (key === "Escape" && findOpen) {
        setFindOpen(false);
        setReplaceOpen(false);
        return;
      }

      if (key === "F3") {
        event.preventDefault();
        setFindOpen(true);
        return;
      }

      if (meta && key.toLowerCase() === "n") {
        event.preventDefault();
        setNewNoteOpen(true);
        return;
      }

      if (meta && !event.shiftKey && (key.toLowerCase() === "p" || key.toLowerCase() === "o")) {
        event.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (meta && event.shiftKey && key.toLowerCase() === "d") {
        event.preventDefault();
        openDailyNote();
        setSidebarOpen(false);
        return;
      }

      if (meta && event.shiftKey && key.toLowerCase() === "p") {
        if (!activeId) return;
        event.preventDefault();
        togglePin(activeId);
        return;
      }

      if (meta && key.toLowerCase() === "k") {
        event.preventDefault();
        if (!isDesktop) setSidebarOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
        return;
      }

      if (meta && key.toLowerCase() === "e") {
        event.preventDefault();
        cyclePreviewMode(isDesktop);
        return;
      }

      if (meta && key === "/") {
        event.preventDefault();
        setHelpOpen(true);
        return;
      }

      if (meta && event.shiftKey && (key === "Backspace" || key === "Delete")) {
        if (!activeId) return;
        event.preventDefault();
        setDeleteOpen(true);
        return;
      }

      if (event.altKey && (key === "ArrowDown" || key === "ArrowUp")) {
        event.preventDefault();
        selectAdjacent(key === "ArrowDown" ? 1 : -1, ids);
        return;
      }

      if (inSearch && (key === "ArrowDown" || key === "ArrowUp")) {
        event.preventDefault();
        selectAdjacent(key === "ArrowDown" ? 1 : -1, ids);
        return;
      }

      if (inSearch && key === "Enter") {
        event.preventDefault();
        setSidebarOpen(false);
        editorRef.current?.focus();
        return;
      }

      if (key === "Escape") {
        if (query) {
          setQuery("");
          return;
        }
        if (!isDesktop) setSidebarOpen(false);
        target?.blur();
        return;
      }

      if (inField) return;

      if (key === "/" || key === "s") {
        event.preventDefault();
        if (!isDesktop) setSidebarOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
        return;
      }

      if (key === "n") {
        event.preventDefault();
        setNewNoteOpen(true);
        return;
      }

      if (key === "j" || key === "ArrowDown") {
        event.preventDefault();
        selectAdjacent(1, ids);
        return;
      }

      if (key === "k" || key === "ArrowUp") {
        event.preventDefault();
        selectAdjacent(-1, ids);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeId,
    cyclePreviewMode,
    deleteOpen,
    editorRef,
    findOpen,
    flashSave,
    helpOpen,
    isDesktop,
    openDailyNote,
    paletteOpen,
    query,
    searchRef,
    selectAdjacent,
    setDeleteOpen,
    setFindOpen,
    setHelpOpen,
    setNewNoteOpen,
    setPaletteOpen,
    setQuery,
    setReplaceOpen,
    setSidebarOpen,
    setWorkspace,
    titleRef,
    togglePin,
    toggleTheme,
    workspace,
  ]);

  return null;
}

function ShellSkeleton() {
  return (
    <div className="flex h-dvh bg-bg">
      <div className="hidden w-48 shrink-0 border-r border-border lg:block">
        <div className="px-4 pt-5 pb-3">
          <p className="font-serif text-lg font-medium tracking-tight text-fg">Vellum</p>
          <p className="text-xs text-subtle">Loading notes</p>
        </div>
      </div>
      <div className="hidden w-72 shrink-0 border-r border-border lg:block">
        <div className="px-3 pt-4">
          <div className="h-11 rounded-md bg-surface" />
        </div>
        <div className="mt-4 space-y-2 px-3">
          <div className="h-16 rounded-sm bg-surface" />
          <div className="h-16 rounded-sm bg-surface" />
          <div className="h-16 rounded-sm bg-surface" />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col bg-paper">
        <div className="flex h-14 items-center border-b border-paper-line px-5">
          <p className="text-sm text-paper-muted">Vellum</p>
        </div>
      </div>
    </div>
  );
}
