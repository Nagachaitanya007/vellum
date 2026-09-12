import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { findAll, replaceAllMatches, replaceAt } from "@/lib/notes/helpers";
import { useNotesStore } from "@/lib/notes/store";
import { useNotesUi } from "./notes-ui";

export function FindReplace({ noteId, content }: { noteId: string; content: string }) {
  const updateNote = useNotesStore((state) => state.updateNote);
  const {
    findOpen,
    replaceOpen,
    setFindOpen,
    setReplaceOpen,
    findRef,
    editorRef,
  } = useNotesUi();
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [index, setIndex] = useState(0);
  const [caseSensitive, setCaseSensitive] = useState(false);

  const hits = findAll(content, query, caseSensitive);

  useEffect(() => {
    if (index >= hits.length) setIndex(0);
  }, [hits.length, index]);

  useEffect(() => {
    if (!findOpen) return;
    requestAnimationFrame(() => findRef.current?.focus());
  }, [findOpen, findRef]);

  function selectHit(nextIndex: number) {
    if (hits.length === 0) return;
    const wrapped = (nextIndex + hits.length) % hits.length;
    setIndex(wrapped);
    const start = hits[wrapped];
    if (start === undefined || !editorRef.current) return;
    const el = editorRef.current;
    el.focus();
    el.setSelectionRange(start, start + query.length);
    requestAnimationFrame(() => findRef.current?.focus());
  }

  function replaceOne() {
    if (hits.length === 0 || !query) return;
    const start = hits[index] ?? hits[0];
    if (start === undefined) return;
    const next = replaceAt(content, start, query.length, replacement);
    updateNote(noteId, { content: next });
  }

  function replaceAll() {
    if (!query) return;
    updateNote(noteId, {
      content: replaceAllMatches(content, query, replacement, caseSensitive),
    });
  }

  if (!findOpen) return null;

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-paper-line bg-paper-hover px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={findRef}
          id="note-find"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              selectHit(event.shiftKey ? index - 1 : index + 1);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setFindOpen(false);
              setReplaceOpen(false);
            }
          }}
          placeholder="Find in note"
          className="h-9 min-w-40 flex-1 rounded-sm bg-paper px-3 text-sm text-paper-fg placeholder:text-paper-subtle outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper-fg"
        />
        <span className="tabular-nums text-xs text-paper-muted">
          {query ? `${hits.length === 0 ? 0 : index + 1}/${hits.length}` : ""}
        </span>
        <Button
          variant="quiet"
          size="icon-sm"
          className="text-paper-muted hover:bg-paper hover:text-paper-fg"
          onClick={() => selectHit(index - 1)}
          aria-label="Previous match"
        >
          <ChevronUp />
        </Button>
        <Button
          variant="quiet"
          size="icon-sm"
          className="text-paper-muted hover:bg-paper hover:text-paper-fg"
          onClick={() => selectHit(index + 1)}
          aria-label="Next match"
        >
          <ChevronDown />
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-paper-muted">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(event) => setCaseSensitive(event.target.checked)}
          />
          Aa
        </label>
        <button
          type="button"
          className="text-xs text-paper-muted underline decoration-dotted"
          onClick={() => setReplaceOpen((open) => !open)}
        >
          Replace
        </button>
        <Button
          variant="quiet"
          size="icon-sm"
          className="text-paper-muted hover:bg-paper hover:text-paper-fg"
          onClick={() => {
            setFindOpen(false);
            setReplaceOpen(false);
          }}
          aria-label="Close find"
        >
          <X />
        </Button>
      </div>
      {replaceOpen ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            placeholder="Replace with"
            className="h-9 min-w-40 flex-1 rounded-sm bg-paper px-3 text-sm text-paper-fg placeholder:text-paper-subtle outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper-fg"
          />
          <Button
            variant="quiet"
            size="sm"
            className="text-paper-muted hover:bg-paper hover:text-paper-fg"
            onClick={replaceOne}
          >
            Replace
          </Button>
          <Button
            variant="quiet"
            size="sm"
            className="text-paper-muted hover:bg-paper hover:text-paper-fg"
            onClick={replaceAll}
          >
            Replace all
          </Button>
        </div>
      ) : null}
    </div>
  );
}
