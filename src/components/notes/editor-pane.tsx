import {
  Download,
  Ellipsis,
  Keyboard,
  Link2,
  List,
  ListTodo,
  Network,
  PanelLeft,
  Pin,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { DrawCanvas } from "@/components/notes/draw-canvas";
import { FindReplace } from "@/components/notes/find-replace";
import { GraphPanel } from "@/components/notes/graph-panel";
import { MentionsPanel } from "@/components/notes/mentions-panel";
import { NoteTabs } from "@/components/notes/note-tabs";
import { VisualNote } from "@/components/notes/visual-note";
import { VoiceButton } from "@/components/notes/voice-button";
import { SlashMenu, slashItemsFor } from "@/components/notes/slash-menu";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import {
  applyLineMarker,
  applySlash,
  displayTitle,
  formatEdited,
  insertImageLine,
  insertSpokenText,
  insertWikiLink,
  openSlashQuery,
  openWikiQuery,
  wordCount,
  wrapSelection,
} from "@/lib/notes/helpers";
import { exportDrawingImage } from "@/lib/notes/drawing";
import { compressImageFile } from "@/lib/notes/images";
import { useActiveNote, useNotesStore } from "@/lib/notes/store";
import { exportNoteMarkdown } from "@/lib/notes/export";
import { VAULT_LIMITS } from "@/lib/notes/vault-ops";
import { cn, modLabel } from "@/lib/utils";
import { useNotesUi } from "./notes-ui";

export function EditorPane() {
  const active = useActiveNote();
  const notes = useNotesStore((state) => state.notes);
  const folders = useNotesStore((state) => state.folders);
  const updateNote = useNotesStore((state) => state.updateNote);
  const togglePin = useNotesStore((state) => state.togglePin);
  const graphOpen = useNotesStore((state) => state.graphOpen);
  const toggleGraph = useNotesStore((state) => state.toggleGraph);
  const {
    titleRef,
    editorRef,
    setDeleteOpen,
    setHelpOpen,
    setNewNoteOpen,
    findOpen,
    setFindOpen,
    setReplaceOpen,
    saveFlash,
    flashSave,
    layout,
    setSidebarOpen,
  } = useNotesUi();
  const mod = modLabel();
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 8 });

  useEffect(() => {
    setNoteHint(null);
  }, [active?.id]);

  useEffect(() => {
    if (!moreOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);
  const [cursor, setCursor] = useState(0);
  const [focusTick, setFocusTick] = useState(0);
  const [noteHint, setNoteHint] = useState<string | null>(null);
  const contentRef = useRef("");
  const cursorRef = useRef(0);
  contentRef.current = active?.content ?? "";
  cursorRef.current = cursor;

  const wikiQuery = active ? openWikiQuery(active.content, cursor) : null;
  const slashQuery = active && wikiQuery === null ? openSlashQuery(active.content, cursor) : null;
  const slashItems = slashQuery !== null ? slashItemsFor(slashQuery) : [];

  const suggestions = useMemo(() => {
    if (wikiQuery === null || !active) return [];
    const q = wikiQuery.toLowerCase();
    const matches = notes
      .filter((note) => note.id !== active.id)
      .filter((note) => displayTitle(note.title).toLowerCase().includes(q))
      .slice(0, 6)
      .map((note) => ({ title: displayTitle(note.title), create: false }));
    const needle = wikiQuery.trim();
    if (
      needle &&
      !matches.some((item) => item.title.toLowerCase() === needle.toLowerCase()) &&
      displayTitle(active.title).toLowerCase() !== needle.toLowerCase()
    ) {
      matches.push({ title: needle, create: true });
    }
    return matches;
  }, [wikiQuery, notes, active]);

  function moveCaret(next: number) {
    setCursor(next);
    setFocusTick((tick) => tick + 1);
  }

  function applyWiki(title: string) {
    if (!active) return;
    const result = insertWikiLink(active.content, cursor, title);
    updateNote(active.id, { content: result.value });
    moveCaret(result.cursor);
  }

  function applySlashItem(insert: string | (() => string)) {
    if (!active) return;
    const text = typeof insert === "function" ? insert() : insert;
    const result = applySlash(active.content, cursor, text);
    updateNote(active.id, { content: result.value });
    moveCaret(result.cursor);
  }

  function applyMarker(kind: "bullet" | "todo") {
    if (!active) return;
    const result = applyLineMarker(active.content, cursor, kind);
    updateNote(active.id, { content: result.value });
    moveCaret(result.cursor);
  }

  function insertLink() {
    if (!active) return;
    const next = `${active.content.slice(0, cursor)}[[${active.content.slice(cursor)}`;
    updateNote(active.id, { content: next });
    moveCaret(cursor + 2);
  }

  function insertSpeech(transcript: string) {
    if (!active) return;
    const inserted = insertSpokenText(contentRef.current, cursorRef.current, transcript);
    if (inserted.value.length > VAULT_LIMITS.maxContentLength) {
      setNoteHint("This note is full.");
      return;
    }
    contentRef.current = inserted.value;
    cursorRef.current = inserted.cursor;
    updateNote(active.id, { content: inserted.value });
    moveCaret(inserted.cursor);
  }

  async function pasteImages(files: File[]) {
    if (!active || files.length === 0) return;
    setNoteHint("Adding image…");
    let content = contentRef.current;
    let caret = cursorRef.current;
    try {
      for (const file of files) {
        const url = await compressImageFile(file);
        const inserted = insertImageLine(content, caret, url);
        if (inserted.value.length > VAULT_LIMITS.maxContentLength) {
          setNoteHint("That image is too large to keep in this note.");
          return;
        }
        content = inserted.value;
        caret = inserted.cursor;
        contentRef.current = content;
        cursorRef.current = caret;
        updateNote(active.id, { content });
      }
      moveCaret(caret);
      setNoteHint(null);
    } catch {
      setNoteHint("Couldn’t add that image. Try a smaller picture.");
    }
  }

  function onTitleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      editorRef.current?.focus();
    }
  }

  function onEditorKeyDown(
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
    start: number,
    end: number,
  ): boolean {
    const meta = event.metaKey || event.ctrlKey;

    if (wikiQuery !== null && suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSuggestIndex((i) => (i + 1) % suggestions.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSuggestIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const pick = suggestions[suggestIndex];
        if (pick) {
          event.preventDefault();
          applyWiki(pick.title);
          return true;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        return true;
      }
    }

    if (slashQuery !== null && slashItems.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSuggestIndex((i) => (i + 1) % slashItems.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSuggestIndex((i) => (i - 1 + slashItems.length) % slashItems.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const pick = slashItems[suggestIndex % slashItems.length];
        if (pick) {
          event.preventDefault();
          applySlashItem(pick.insert);
          return true;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        return true;
      }
    }

    if (!meta || !active) return false;

    const key = event.key.toLowerCase();
    if (key === "s") {
      event.preventDefault();
      flashSave();
      return true;
    }
    if (key === "f") {
      event.preventDefault();
      setFindOpen(true);
      return true;
    }
    if (key === "h") {
      event.preventDefault();
      setFindOpen(true);
      setReplaceOpen(true);
      return true;
    }
    if (key !== "b" && key !== "i" && key !== "`") return false;

    event.preventDefault();
    const wrap = key === "b" ? "**" : key === "i" ? "*" : "`";
    const result = wrapSelection(active.content, start, end, wrap);
    updateNote(active.id, { content: result.value });
    moveCaret(result.end);
    return true;
  }

  function openMore(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 6,
      right: Math.max(8, window.innerWidth - rect.right),
    });
    setMoreOpen((open) => !open);
  }

  if (!active) {
    return (
      <div className="paper-pane flex h-full min-h-0 flex-col bg-paper text-paper-fg">
        <NoteTabs />
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        {layout === "tablet" ? (
          <Button
            variant="quiet"
            className="mb-4"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeft /> Open notes
          </Button>
        ) : null}
        <p className="font-serif text-2xl font-medium tracking-tight text-balance">
          A blank page
        </p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-paper-muted text-pretty">
          New note from the list, or {mod}N. Choose a page or a canvas board.
        </p>
        <Button
          className="mt-6 bg-paper-fg text-paper hover:opacity-90"
          onClick={() => setNewNoteOpen(true)}
        >
          New note
        </Button>
      </div>
      </div>
    );
  }

  const words = wordCount(active.content);
  const edited = formatEdited(active.updatedAt);
  const showSuggest = wikiQuery !== null && suggestions.length > 0;
  const showSlash = slashQuery !== null && slashItems.length > 0;

  if (active.kind === "canvas") {
    return (
      <div className="paper-pane flex h-full min-h-0 flex-col bg-paper text-paper-fg">
        <NoteTabs />
        <header className="flex h-12 shrink-0 items-center gap-1 border-b border-paper-line bg-paper px-2 lg:h-auto lg:px-5 lg:py-2">
          {layout === "tablet" ? (
            <Button
              variant="quiet"
              size="icon"
              className="text-paper-muted hover:bg-paper-hover hover:text-paper-fg"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open library"
            >
              <PanelLeft />
            </Button>
          ) : null}
          <input
            id="note-title"
            ref={titleRef}
            value={active.title}
            onChange={(event) => updateNote(active.id, { title: event.target.value })}
            placeholder="Untitled board"
            aria-label="Board title"
            className="min-w-0 flex-1 bg-transparent px-1 font-serif text-base font-medium tracking-tight text-paper-fg placeholder:text-paper-subtle outline-none lg:text-lg"
          />
          <p className="hidden shrink-0 px-2 text-xs text-paper-subtle lg:block">
            <span className="tabular-nums">{edited}</span>
            {saveFlash ? <span className="ml-2 text-paper-fg">Saved</span> : null}
          </p>
          <div className="relative hidden items-center lg:flex">
            <Hint label={active.pinned ? "Unpin" : "Pin"} shortcut={`${mod}⇧P`}>
              <Button
                variant="quiet"
                size="icon-sm"
                className={cn(
                  "text-paper-muted hover:bg-paper-hover hover:text-paper-fg",
                  active.pinned && "text-paper-fg",
                )}
                onClick={() => togglePin(active.id)}
                aria-label={active.pinned ? "Unpin board" : "Pin board"}
              >
                <Pin />
              </Button>
            </Hint>
            <Hint label="Delete board" shortcut={`${mod}⇧⌫`}>
              <Button
                variant="danger"
                size="icon-sm"
                className="hover:bg-danger/10"
                onClick={() => setDeleteOpen(true)}
                aria-label="Delete board"
              >
                <Trash2 />
              </Button>
            </Hint>
          </div>
          <div className="relative shrink-0" ref={moreRef}>
            <Button
              variant="quiet"
              size="icon"
              className="text-paper-muted hover:bg-paper-hover hover:text-paper-fg lg:size-9"
              onClick={openMore}
              aria-label="More actions"
              aria-expanded={moreOpen}
              aria-haspopup="menu"
            >
              <Ellipsis />
            </Button>
            {moreOpen
              ? createPortal(
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-50 cursor-default"
                      aria-label="Close menu"
                      onClick={() => setMoreOpen(false)}
                    />
                    <div
                      role="menu"
                      className="fixed z-50 w-52 overflow-hidden rounded-md bg-raised py-1 text-fg shadow-border"
                      style={{ top: menuPos.top, right: menuPos.right }}
                    >
                      <label className="flex h-11 w-full items-center gap-2 px-3 text-sm">
                        <span className="w-4" />
                        <select
                          value={active.folderId ?? ""}
                          onChange={(event) =>
                            updateNote(active.id, {
                              folderId: event.target.value ? event.target.value : null,
                            })
                          }
                          className="h-9 min-w-0 flex-1 rounded-sm bg-surface px-2 text-sm text-fg outline-none"
                          aria-label="Folder"
                        >
                          <option value="">Unfiled</option>
                          {folders.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface-hover"
                        onClick={() => {
                          void exportDrawingImage(active.drawing, displayTitle(active.title), "png");
                          setMoreOpen(false);
                        }}
                      >
                        <Download className="size-4" /> Export PNG
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface-hover"
                        onClick={() => {
                          void exportDrawingImage(active.drawing, displayTitle(active.title), "jpeg");
                          setMoreOpen(false);
                        }}
                      >
                        <Download className="size-4" /> Export JPEG
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface-hover"
                        onClick={() => {
                          togglePin(active.id);
                          setMoreOpen(false);
                        }}
                      >
                        <Pin className="size-4" /> {active.pinned ? "Unpin" : "Pin"}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="flex h-11 w-full items-center gap-2 px-3 text-left text-sm text-danger hover:bg-danger/10"
                        onClick={() => {
                          setDeleteOpen(true);
                          setMoreOpen(false);
                        }}
                      >
                        <Trash2 className="size-4" /> Delete
                      </button>
                    </div>
                  </>,
                  document.body,
                )
              : null}
          </div>
        </header>
        <div className="min-h-0 flex-1">
          <DrawCanvas noteId={active.id} drawing={active.drawing} title={active.title} />
        </div>
      </div>
    );
  }

  return (
    <div className="paper-pane flex h-full min-h-0 flex-col bg-paper text-paper-fg">
      <NoteTabs />
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-paper-line bg-paper px-2 lg:h-auto lg:px-5 lg:py-2">
        {layout === "tablet" ? (
          <Button
            variant="quiet"
            size="icon"
            className="text-paper-muted hover:bg-paper-hover hover:text-paper-fg"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open library"
          >
            <PanelLeft />
          </Button>
        ) : null}
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        <p className="hidden min-w-0 flex-1 truncate px-1 text-sm text-paper-muted lg:block">
          <span className="text-paper-fg">{displayTitle(active.title)}</span>
          <span>
            {" "}
            · <span className="tabular-nums">{edited}</span>
            {" · "}
            <span className="tabular-nums">
              {words} {words === 1 ? "word" : "words"}
            </span>
            {saveFlash ? <span className="ml-2 text-paper-fg">Saved</span> : null}
          </span>
        </p>

        <label className="sr-only" htmlFor="note-folder">
          Folder
        </label>
        <select
          id="note-folder"
          value={active.folderId ?? ""}
          onChange={(event) =>
            updateNote(active.id, {
              folderId: event.target.value ? event.target.value : null,
            })
          }
          className="hidden h-9 max-w-32 truncate rounded-sm bg-transparent px-2 text-sm text-paper-muted outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper-fg lg:block"
        >
          <option value="">Unfiled</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
        </div>

        <Hint label="Find in note" shortcut={`${mod}F`}>
          <Button
            variant="quiet"
            size="icon-sm"
            className={cn(
              "size-11 text-paper-muted hover:bg-paper-hover hover:text-paper-fg lg:size-9",
              findOpen && "text-paper-fg",
            )}
            onClick={() => {
              setFindOpen(true);
              setReplaceOpen(false);
            }}
            aria-label="Find in note"
          >
            <Search />
          </Button>
        </Hint>
        <div className="relative hidden items-center lg:flex">
          <Hint label="Save" shortcut={`${mod}S`}>
            <Button
              variant="quiet"
              size="icon-sm"
              className={cn(
                "text-paper-muted hover:bg-paper-hover hover:text-paper-fg",
                saveFlash && "text-paper-fg",
              )}
              onClick={flashSave}
              aria-label="Save note"
            >
              <Save />
            </Button>
          </Hint>
          <Hint label="Download markdown">
            <Button
              variant="quiet"
              size="icon-sm"
              className="text-paper-muted hover:bg-paper-hover hover:text-paper-fg"
              onClick={() => exportNoteMarkdown(active, folders)}
              aria-label="Download this note as markdown"
            >
              <Download />
            </Button>
          </Hint>
          <Hint label={active.pinned ? "Unpin" : "Pin"} shortcut={`${mod}⇧P`}>
            <Button
              variant="quiet"
              size="icon-sm"
              className={cn(
                "text-paper-muted hover:bg-paper-hover hover:text-paper-fg",
                active.pinned && "text-paper-fg",
              )}
              onClick={() => togglePin(active.id)}
              aria-label={active.pinned ? "Unpin note" : "Pin note"}
            >
              <Pin />
            </Button>
          </Hint>
          <Hint label={graphOpen ? "Hide local graph" : "Local graph"}>
            <Button
              variant="quiet"
              size="icon-sm"
              className={cn(
                "text-paper-muted hover:bg-paper-hover hover:text-paper-fg",
                graphOpen && "text-paper-fg",
              )}
              onClick={toggleGraph}
              aria-label={graphOpen ? "Hide local graph" : "Show local graph"}
            >
              <Network />
            </Button>
          </Hint>
          <Hint label="Keyboard shortcuts" shortcut={`${mod}/`}>
            <Button
              variant="quiet"
              size="icon-sm"
              className="text-paper-muted hover:bg-paper-hover hover:text-paper-fg"
              onClick={() => setHelpOpen(true)}
              aria-label="Keyboard shortcuts"
            >
              <Keyboard />
            </Button>
          </Hint>
          <Hint label="Delete note" shortcut={`${mod}⇧⌫`}>
            <Button
              variant="danger"
              size="icon-sm"
              className="hover:bg-danger/10"
              onClick={() => setDeleteOpen(true)}
              aria-label="Delete note"
            >
              <Trash2 />
            </Button>
          </Hint>
        </div>
        <div className="relative shrink-0" ref={moreRef}>
          <Button
            variant="quiet"
            size="icon"
            className="text-paper-muted hover:bg-paper-hover hover:text-paper-fg lg:size-9"
            onClick={openMore}
            aria-label="More actions"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
          >
            <Ellipsis />
          </Button>
          {moreOpen
            ? createPortal(
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-50 cursor-default"
                    aria-label="Close menu"
                    onClick={() => setMoreOpen(false)}
                  />
                  <div
                    role="menu"
                    className="fixed z-50 w-52 overflow-hidden rounded-md bg-raised py-1 text-fg shadow-border"
                    style={{ top: menuPos.top, right: menuPos.right }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="flex h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface-hover"
                      onClick={() => {
                        flashSave();
                        setMoreOpen(false);
                      }}
                    >
                      <Save className="size-4" /> Save
                    </button>
                    <label className="flex h-11 w-full items-center gap-2 px-3 text-sm">
                      <span className="w-4" />
                      <select
                        value={active.folderId ?? ""}
                        onChange={(event) =>
                          updateNote(active.id, {
                            folderId: event.target.value ? event.target.value : null,
                          })
                        }
                        className="h-9 min-w-0 flex-1 rounded-sm bg-surface px-2 text-sm text-fg outline-none"
                        aria-label="Folder"
                      >
                        <option value="">Unfiled</option>
                        {folders.map((folder) => (
                          <option key={folder.id} value={folder.id}>
                            {folder.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface-hover"
                      onClick={() => {
                        exportNoteMarkdown(active, folders);
                        setMoreOpen(false);
                      }}
                    >
                      <Download className="size-4" /> Download
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface-hover"
                      onClick={() => {
                        togglePin(active.id);
                        setMoreOpen(false);
                      }}
                    >
                      <Pin className="size-4" /> {active.pinned ? "Unpin" : "Pin"}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface-hover"
                      onClick={() => {
                        toggleGraph();
                        setMoreOpen(false);
                      }}
                    >
                      <Network className="size-4" /> Local graph
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="flex h-11 w-full items-center gap-2 px-3 text-left text-sm text-danger hover:bg-danger/10"
                      onClick={() => {
                        setDeleteOpen(true);
                        setMoreOpen(false);
                      }}
                    >
                      <Trash2 className="size-4" /> Delete
                    </button>
                  </div>
                </>,
                document.body,
              )
            : null}
        </div>
      </header>

      <FindReplace noteId={active.id} content={active.content} />

      <div key={active.id} className="relative flex min-h-0 flex-1">
        <div className="scroll-thin relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-5 lg:px-10 lg:py-8">
            <input
              id="note-title"
              ref={titleRef}
              value={active.title}
              onChange={(event) => updateNote(active.id, { title: event.target.value })}
              onKeyDown={onTitleKeyDown}
              placeholder="Untitled"
              aria-label="Note title"
              className="w-full bg-transparent font-serif text-2xl font-medium tracking-tight text-paper-fg placeholder:text-paper-subtle outline-none lg:text-3xl"
            />
            <div className="mt-3 mb-4 flex items-center gap-1">
              <Button
                variant="quiet"
                size="sm"
                className="text-paper-muted hover:bg-paper-hover hover:text-paper-fg"
                onClick={() => applyMarker("bullet")}
              >
                <List /> List
              </Button>
              <Button
                variant="quiet"
                size="sm"
                className="text-paper-muted hover:bg-paper-hover hover:text-paper-fg"
                onClick={() => applyMarker("todo")}
              >
                <ListTodo /> To-do
              </Button>
              <Button
                variant="quiet"
                size="sm"
                className="text-paper-muted hover:bg-paper-hover hover:text-paper-fg"
                onClick={insertLink}
              >
                <Link2 /> Link
              </Button>
              <VoiceButton onText={insertSpeech} onHint={setNoteHint} />
            </div>
            {noteHint ? <p className="mb-3 text-sm text-paper-muted">{noteHint}</p> : null}
            <p className="mb-4 text-xs text-paper-subtle sm:hidden">
              <span className="tabular-nums">{edited}</span>
              {" · "}
              <span className="tabular-nums">
                {words} {words === 1 ? "word" : "words"}
              </span>
              {saveFlash ? <span className="ml-2">Saved</span> : null}
            </p>
            <VisualNote
              value={active.content}
              focusTick={focusTick}
              focusAt={cursor}
              editorRef={editorRef}
              placeholder="Write a note. Paste an image, or use Voice to dictate."
              onCursor={setCursor}
              onPasteImages={pasteImages}
              onChange={(next, caret) => {
                updateNote(active.id, { content: next });
                setCursor(caret);
                setSuggestIndex(0);
              }}
              onKeyDown={onEditorKeyDown}
            />
          </div>
          {showSuggest ? (
            <ul
              className="absolute bottom-6 left-5 z-10 w-64 overflow-hidden rounded-md bg-raised text-fg shadow-border md:left-10"
              role="listbox"
              aria-label="Link to note"
            >
              {suggestions.map((item, index) => (
                <li key={`${item.create ? "create" : "note"}-${item.title}`}>
                  <button
                    type="button"
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm",
                      index === suggestIndex ? "bg-surface-hover" : "hover:bg-surface",
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applyWiki(item.title);
                    }}
                  >
                    {item.create ? `Create “${item.title}”` : item.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {showSlash ? (
            <SlashMenu
              query={slashQuery ?? ""}
              index={suggestIndex}
              onPick={applySlashItem}
            />
          ) : null}
        </div>
      </div>

      {graphOpen ? <GraphPanel /> : null}
      <MentionsPanel note={active} />
    </div>
  );
}
