import {
  Columns2,
  Eye,
  Keyboard,
  Network,
  Pencil,
  PenTool,
  Pin,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { DrawCanvas } from "@/components/notes/draw-canvas";
import { FindReplace } from "@/components/notes/find-replace";
import { GraphPanel } from "@/components/notes/graph-panel";
import { MarkdownPreview } from "@/components/notes/markdown-preview";
import { MentionsPanel } from "@/components/notes/mentions-panel";
import { SlashMenu, slashItemsFor } from "@/components/notes/slash-menu";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import {
  applySlash,
  displayTitle,
  extractTags,
  formatEdited,
  insertWikiLink,
  openSlashQuery,
  openWikiQuery,
  wordCount,
  wrapSelection,
} from "@/lib/notes/helpers";
import { useActiveNote, useNotesStore } from "@/lib/notes/store";
import type { PreviewMode } from "@/lib/notes/types";
import { cn, modLabel } from "@/lib/utils";
import { useNotesUi } from "./notes-ui";

const modes: { id: PreviewMode; label: string; desktopOnly?: boolean }[] = [
  { id: "edit", label: "Write" },
  { id: "preview", label: "Preview" },
  { id: "split", label: "Split", desktopOnly: true },
  { id: "draw", label: "Draw" },
];

export function EditorPane() {
  const active = useActiveNote();
  const notes = useNotesStore((state) => state.notes);
  const folders = useNotesStore((state) => state.folders);
  const updateNote = useNotesStore((state) => state.updateNote);
  const createNote = useNotesStore((state) => state.createNote);
  const togglePin = useNotesStore((state) => state.togglePin);
  const previewMode = useNotesStore((state) => state.previewMode);
  const setPreviewMode = useNotesStore((state) => state.setPreviewMode);
  const graphOpen = useNotesStore((state) => state.graphOpen);
  const toggleGraph = useNotesStore((state) => state.toggleGraph);
  const {
    titleRef,
    editorRef,
    setDeleteOpen,
    setHelpOpen,
    isDesktop,
    findOpen,
    setFindOpen,
    setReplaceOpen,
    saveFlash,
    flashSave,
  } = useNotesUi();
  const mod = modLabel();
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [cursor, setCursor] = useState(0);

  const mode = !isDesktop && previewMode === "split" ? "edit" : previewMode;
  const showEditor = mode === "edit" || mode === "split";
  const showPreview = mode === "preview" || mode === "split";
  const showDraw = mode === "draw";

  const wikiQuery = active && showEditor ? openWikiQuery(active.content, cursor) : null;
  const slashQuery = active && showEditor && wikiQuery === null ? openSlashQuery(active.content, cursor) : null;
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

  const tags = active ? extractTags(active.content) : [];

  function applyWiki(title: string) {
    if (!active || !editorRef.current) return;
    const at = editorRef.current.selectionStart;
    const result = insertWikiLink(active.content, at, title);
    updateNote(active.id, { content: result.value });
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current!.selectionStart = editorRef.current!.selectionEnd = result.cursor;
    });
  }

  function applySlashItem(insert: string) {
    if (!active || !editorRef.current) return;
    const at = editorRef.current.selectionStart;
    const result = applySlash(active.content, at, insert);
    updateNote(active.id, { content: result.value });
    requestAnimationFrame(() => {
      editorRef.current?.focus();
      editorRef.current!.selectionStart = editorRef.current!.selectionEnd = result.cursor;
    });
  }

  function onTitleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      editorRef.current?.focus();
    }
  }

  function onEditorKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    const meta = event.metaKey || event.ctrlKey;
    const el = event.currentTarget;

    if (wikiQuery !== null && suggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSuggestIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSuggestIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const pick = suggestions[suggestIndex];
        if (pick) {
          event.preventDefault();
          applyWiki(pick.title);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }
    }

    if (slashQuery !== null && slashItems.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSuggestIndex((i) => (i + 1) % slashItems.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSuggestIndex((i) => (i - 1 + slashItems.length) % slashItems.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const pick = slashItems[suggestIndex % slashItems.length];
        if (pick) {
          event.preventDefault();
          applySlashItem(pick.insert);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }
    }

    if (event.key === "Tab") {
      event.preventDefault();
      if (!active) return;
      const { selectionStart, selectionEnd, value } = el;
      const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
      updateNote(active.id, { content: next });
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = selectionStart + 2;
      });
      return;
    }

    if (!meta || !active) return;

    const key = event.key.toLowerCase();
    if (key === "s") {
      event.preventDefault();
      flashSave();
      return;
    }
    if (key === "f") {
      event.preventDefault();
      setFindOpen(true);
      return;
    }
    if (key === "h") {
      event.preventDefault();
      setFindOpen(true);
      setReplaceOpen(true);
      return;
    }
    if (key !== "b" && key !== "i" && key !== "`") return;

    event.preventDefault();
    const wrap = key === "b" ? "**" : key === "i" ? "*" : "`";
    const result = wrapSelection(el.value, el.selectionStart, el.selectionEnd, wrap);
    updateNote(active.id, { content: result.value });
    requestAnimationFrame(() => {
      el.selectionStart = result.start;
      el.selectionEnd = result.end;
    });
  }

  if (!active) {
    return (
      <div className="paper-pane flex h-full min-h-0 flex-col items-center justify-center bg-paper px-6 text-center text-paper-fg">
        <p className="font-serif text-2xl font-medium tracking-tight text-balance">
          A blank page
        </p>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-paper-muted text-pretty">
          New note from the list, or {mod}N. Link pages with [[brackets]]. Everything stays on
          this device.
        </p>
        <Button
          className="mt-6 bg-paper-fg text-paper hover:opacity-90"
          onClick={() => {
            createNote();
            requestAnimationFrame(() => titleRef.current?.focus());
          }}
        >
          New note
        </Button>
      </div>
    );
  }

  const words = wordCount(active.content);
  const edited = formatEdited(active.updatedAt);
  const showSuggest = showEditor && wikiQuery !== null && suggestions.length > 0;
  const showSlash = showEditor && slashQuery !== null && slashItems.length > 0;

  return (
    <div className="paper-pane flex h-full min-h-0 flex-col bg-paper text-paper-fg">
      <header className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-paper-line px-3 py-2 md:px-5">
        <p className="hidden min-w-0 flex-1 truncate px-1 text-sm text-paper-muted md:block">
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
          className="h-9 max-w-32 truncate rounded-sm bg-transparent px-2 text-sm text-paper-muted outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper-fg"
        >
          <option value="">Unfiled</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>

        <div
          className="ml-auto flex rounded-md bg-paper-hover p-0.5 md:ml-0"
          role="tablist"
          aria-label="Editor view"
        >
          {modes.map((item) => {
            if (item.desktopOnly && !isDesktop) return null;
            const selected = mode === item.id;
            const Icon =
              item.id === "edit"
                ? Pencil
                : item.id === "preview"
                  ? Eye
                  : item.id === "draw"
                    ? PenTool
                    : Columns2;
            return (
              <Hint
                key={item.id}
                label={item.label}
                shortcut={item.id === "edit" ? `${mod}E` : undefined}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setPreviewMode(item.id)}
                  className={cn(
                    "inline-flex size-9 items-center justify-center rounded-sm text-paper-subtle transition-[background-color,color] duration-quick ease-smooth",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper-fg",
                    selected ? "bg-paper text-paper-fg shadow-paper" : "hover:text-paper-fg",
                  )}
                  aria-label={item.label}
                >
                  <Icon className="size-4" />
                </button>
              </Hint>
            );
          })}
        </div>

        <Hint label="Find in note" shortcut={`${mod}F`}>
          <Button
            variant="quiet"
            size="icon-sm"
            className={cn(
              "text-paper-muted hover:bg-paper-hover hover:text-paper-fg",
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
        <Hint label="Local graph">
          <Button
            variant="quiet"
            size="icon-sm"
            className={cn(
              "text-paper-muted hover:bg-paper-hover hover:text-paper-fg",
              graphOpen && "text-paper-fg",
            )}
            onClick={toggleGraph}
            aria-label="Toggle local graph"
          >
            <Network />
          </Button>
        </Hint>
        <Hint label="Keyboard shortcuts" shortcut={`${mod}/`}>
          <Button
            variant="quiet"
            size="icon-sm"
            className="hidden text-paper-muted hover:bg-paper-hover hover:text-paper-fg md:inline-flex"
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
      </header>

      {showEditor ? <FindReplace noteId={active.id} content={active.content} /> : null}

      {showDraw ? (
        <div className="min-h-0 flex-1">
          <DrawCanvas noteId={active.id} drawing={active.drawing} />
        </div>
      ) : (
        <div
          className={cn(
            "relative min-h-0 flex-1",
            mode === "split" ? "grid grid-cols-2 divide-x divide-paper-line" : "flex",
          )}
        >
          {showEditor ? (
            <div className="scroll-thin relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
              <div
                className={cn(
                  "mx-auto flex w-full flex-1 flex-col px-5 py-6 md:px-10 md:py-8",
                  mode === "split" ? "max-w-none" : "max-w-2xl",
                )}
              >
                <input
                  id="note-title"
                  ref={titleRef}
                  value={active.title}
                  onChange={(event) => updateNote(active.id, { title: event.target.value })}
                  onKeyDown={onTitleKeyDown}
                  placeholder="Untitled"
                  aria-label="Note title"
                  className="w-full bg-transparent font-serif text-3xl font-medium tracking-tight text-paper-fg placeholder:text-paper-subtle outline-none"
                />
                <p className="mt-2 mb-5 text-xs text-paper-subtle sm:hidden">
                  <span className="tabular-nums">{edited}</span>
                  {" · "}
                  <span className="tabular-nums">
                    {words} {words === 1 ? "word" : "words"}
                  </span>
                  {saveFlash ? <span className="ml-2">Saved</span> : null}
                </p>
                <textarea
                  id="note-body"
                  ref={editorRef}
                  value={active.content}
                  onChange={(event) => {
                    updateNote(active.id, { content: event.target.value });
                    setCursor(event.target.selectionStart);
                    setSuggestIndex(0);
                  }}
                  onKeyUp={(event) => setCursor(event.currentTarget.selectionStart)}
                  onClick={(event) => setCursor(event.currentTarget.selectionStart)}
                  onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
                  onKeyDown={onEditorKeyDown}
                  placeholder="Start writing… / for blocks, [[ for links, # for tags."
                  aria-label="Note body"
                  spellCheck
                  className="min-h-64 w-full flex-1 resize-none bg-transparent pb-16 font-serif text-lg leading-writing text-paper-fg placeholder:text-paper-subtle outline-none"
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
          ) : null}

          {showPreview ? (
            <div className="scroll-thin min-h-0 min-w-0 flex-1 overflow-y-auto">
              <div
                className={cn(
                  "mx-auto w-full px-5 py-6 md:px-10 md:py-8",
                  mode === "split" ? "max-w-none" : "max-w-2xl",
                )}
              >
                {mode === "preview" ? (
                  <h1 className="mb-5 font-serif text-3xl font-medium tracking-tight text-balance">
                    {displayTitle(active.title)}
                  </h1>
                ) : (
                  <p className="mb-5 font-serif text-sm tracking-wide text-paper-subtle">Preview</p>
                )}
                <MarkdownPreview noteId={active.id} content={active.content} />
              </div>
            </div>
          ) : null}
        </div>
      )}

      {graphOpen && !showDraw ? <GraphPanel /> : null}
      {!showDraw ? <MentionsPanel note={active} /> : null}

      {tags.length > 0 && showDraw ? (
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-paper-line px-4 py-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-paper-hover px-2 py-0.5 font-sans text-xs text-paper-muted"
            >
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
