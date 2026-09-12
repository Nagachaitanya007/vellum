import { Menu, Plus, Search } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { CommandPalette } from "@/components/notes/command-palette";
import { DeleteDialog } from "@/components/notes/delete-dialog";
import { EditorPane } from "@/components/notes/editor-pane";
import { LibraryRail } from "@/components/notes/library-rail";
import { NoteList } from "@/components/notes/note-list";
import { NotesUiProvider, useNotesUi } from "@/components/notes/notes-ui";
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

function revealNotes() {
  hydrateNotesFromStorage();
}

export function AppShell() {
  const hasHydrated = useNotesStore((state) => state.hasHydrated);
  const theme = useNotesStore((state) => state.theme);
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    setIsDesktop(mq.matches);
    hydrateNotesFromStorage();
  }, []);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", update);
    try {
      void useNotesStore.persist.rehydrate();
    } catch {
      revealNotes();
    }
    return () => mq.removeEventListener("change", update);
  }, []);

  if (!hasHydrated || isDesktop === null) {
    return <ShellSkeleton />;
  }

  return (
    <TooltipProvider>
      <NotesUiProvider isDesktop={isDesktop}>
        <KeyboardBindings />
        {isDesktop ? <DesktopLayout /> : <MobileLayout />}
        <DeleteDialog />
        <ShortcutsDialog />
        <CommandPalette />
      </NotesUiProvider>
    </TooltipProvider>
  );
}

function DesktopLayout() {
  const workspace = useNotesStore((state) => state.workspace);
  return (
    <div className="h-dvh overflow-hidden">
      <Group orientation="horizontal" className="h-full">
        <Panel defaultSize={200} minSize={160} maxSize={280} className="min-h-0">
          <LibraryRail />
        </Panel>
        <Separator className="w-1 bg-border hover:bg-subtle/40" />
        {workspace === "graph" ? (
          <Panel minSize={360} className="min-h-0">
            <VaultGraph />
          </Panel>
        ) : (
          <>
            <Panel defaultSize={280} minSize={220} maxSize={520} className="min-h-0">
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

function MobileLayout() {
  const active = useActiveNote();
  const createNote = useNotesStore((state) => state.createNote);
  const workspace = useNotesStore((state) => state.workspace);
  const { sidebarOpen, setSidebarOpen, titleRef, setPaletteOpen } = useNotesUi();

  function handleCreate() {
    createNote();
    setSidebarOpen(false);
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-bg px-2 py-1.5">
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

      <div className={sidebarOpen ? "fixed inset-0 z-40" : "pointer-events-none fixed inset-0 z-40"}>
        <button
          type="button"
          aria-label="Dismiss library"
          onClick={() => setSidebarOpen(false)}
          className={
            sidebarOpen
              ? "absolute inset-0 bg-bg/70 opacity-100 transition-opacity duration-fast ease-smooth"
              : "absolute inset-0 bg-bg/70 opacity-0 transition-opacity duration-quick ease-smooth"
          }
        />
        <aside
          className={
            sidebarOpen
              ? "absolute inset-y-0 left-0 flex w-full max-w-md translate-x-0 border-r border-border bg-bg shadow-border transition-transform duration-fast ease-smooth"
              : "absolute inset-y-0 left-0 flex w-full max-w-md -translate-x-full border-r border-border bg-bg shadow-border transition-transform duration-quick ease-smooth"
          }
        >
          <div className="flex w-40 shrink-0 flex-col border-r border-border">
            <LibraryRail onClose={() => setSidebarOpen(false)} />
          </div>
          <div className="min-w-0 flex-1">
            <NoteList />
          </div>
        </aside>
      </div>
    </div>
  );
}

function KeyboardBindings() {
  const createNote = useNotesStore((state) => state.createNote);
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
  } = useNotesUi();

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
      const ids = filteredNotes.map((note) => note.id);

      if (meta && key.toLowerCase() === "s") {
        event.preventDefault();
        flashSave();
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
        createNote();
        setQuery("");
        setSidebarOpen(false);
        requestAnimationFrame(() => titleRef.current?.focus());
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
        createNote();
        setQuery("");
        requestAnimationFrame(() => titleRef.current?.focus());
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
    createNote,
    cyclePreviewMode,
    deleteOpen,
    editorRef,
    filteredNotes,
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
      <div className="hidden w-48 shrink-0 border-r border-border md:block">
        <div className="px-4 pt-5 pb-3">
          <p className="font-serif text-lg font-medium tracking-tight text-fg">Vellum</p>
          <p className="text-xs text-subtle">Loading notes</p>
        </div>
      </div>
      <div className="hidden w-72 shrink-0 border-r border-border md:block">
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
