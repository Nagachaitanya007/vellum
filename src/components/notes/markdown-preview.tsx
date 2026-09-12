import { useDeferredValue, useMemo, type MouseEvent } from "react";
import { displayTitle, findNoteByTitle, snippet, splitEmbeds, toggleTaskAt } from "@/lib/notes/helpers";
import { renderMarkdown } from "@/lib/notes/markdown";
import { useNotesStore } from "@/lib/notes/store";
import { useNotesUi } from "./notes-ui";

export function MarkdownPreview({
  noteId,
  content,
  depth = 0,
}: {
  noteId: string;
  content: string;
  depth?: number;
}) {
  const deferred = useDeferredValue(content);
  const chunks = useMemo(() => splitEmbeds(deferred), [deferred]);

  if (!deferred.trim()) {
    return (
      <p className="font-serif text-lg text-paper-subtle italic">Nothing to preview yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {chunks.map((chunk, index) =>
        chunk.type === "md" ? (
          <MarkdownChunk
            key={`${noteId}-md-${index}`}
            noteId={noteId}
            content={chunk.value}
          />
        ) : (
          <EmbedCard
            key={`${noteId}-embed-${chunk.title}-${index}`}
            title={chunk.title}
            depth={depth}
          />
        ),
      )}
    </div>
  );
}

function MarkdownChunk({ noteId, content }: { noteId: string; content: string }) {
  const notes = useNotesStore((state) => state.notes);
  const updateNote = useNotesStore((state) => state.updateNote);
  const openWiki = useNotesStore((state) => state.openWiki);
  const setFilter = useNotesStore((state) => state.setFilter);
  const { setSidebarOpen } = useNotesUi();
  const source = useNotesStore((state) => state.notes.find((note) => note.id === noteId)?.content ?? content);

  const titles = useMemo(
    () => notes.map((note) => displayTitle(note.title)),
    [notes],
  );
  const html = useMemo(() => renderMarkdown(content, titles), [content, titles]);

  function onClick(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;

    const task = target.closest("input[data-task]") as HTMLInputElement | null;
    if (task) {
      event.preventDefault();
      const index = Number(task.dataset.task);
      if (Number.isFinite(index)) {
        updateNote(noteId, { content: toggleTaskAt(source, index) });
      }
      return;
    }

    const wiki = target.closest("a.wiki-link") as HTMLAnchorElement | null;
    if (wiki?.dataset.wiki) {
      event.preventDefault();
      openWiki(wiki.dataset.wiki);
      setSidebarOpen(false);
      return;
    }

    const tag = target.closest("a.hashtag") as HTMLAnchorElement | null;
    if (tag?.dataset.tag) {
      event.preventDefault();
      setFilter({ type: "tag", tag: tag.dataset.tag });
    }
  }

  if (!content.trim()) return null;

  return (
    <div className="md-preview" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function EmbedCard({
  title,
  depth,
}: {
  title: string;
  depth: number;
}) {
  const notes = useNotesStore((state) => state.notes);
  const openWiki = useNotesStore((state) => state.openWiki);
  const { setSidebarOpen } = useNotesUi();
  const note = findNoteByTitle(notes, title);

  if (!note) {
    return (
      <button
        type="button"
        onClick={() => {
          openWiki(title);
          setSidebarOpen(false);
        }}
        className="rounded-md border border-dashed border-paper-line px-4 py-3 text-left text-sm text-paper-muted"
      >
        Missing page · {title}
      </button>
    );
  }

  return (
    <div className="rounded-md border border-paper-line px-4 py-3">
      <button
        type="button"
        className="font-serif text-base font-medium text-paper-fg underline decoration-dotted underline-offset-2"
        onClick={() => {
          openWiki(note.title);
          setSidebarOpen(false);
        }}
      >
        {displayTitle(note.title)}
      </button>
      {depth < 1 ? (
        <div className="mt-2 text-sm">
          <MarkdownPreview noteId={note.id} content={note.content} depth={depth + 1} />
        </div>
      ) : (
        <p className="mt-1 text-sm text-paper-muted">{snippet(note.content, 140)}</p>
      )}
    </div>
  );
}
