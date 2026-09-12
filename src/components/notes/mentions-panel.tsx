import { useState, type ReactNode } from "react";
import {
  backlinksTo,
  convertMentionToLink,
  displayTitle,
  extractWikiLinks,
  snippet,
  unlinkedMentions,
} from "@/lib/notes/helpers";
import { useNotesStore } from "@/lib/notes/store";
import type { Note } from "@/lib/notes/types";
import { useNotesUi } from "./notes-ui";

export function MentionsPanel({ note }: { note: Note }) {
  const notes = useNotesStore((state) => state.notes);
  const openWiki = useNotesStore((state) => state.openWiki);
  const updateNote = useNotesStore((state) => state.updateNote);
  const { isDesktop } = useNotesUi();
  const linked = backlinksTo(notes, note);
  const unlinked = unlinkedMentions(notes, note);
  const outgoing = extractWikiLinks(note.content);
  const [open, setOpen] = useState(isDesktop);

  return (
    <footer className="shrink-0 border-t border-paper-line">
      <button
        type="button"
        className="flex h-11 w-full items-center justify-between gap-3 px-4 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="text-xs font-medium tracking-wide text-paper-subtle uppercase">
          Mentions
        </span>
        <span className="text-xs text-paper-muted tabular-nums">
          {linked.length} linked · {unlinked.length} unlinked · {outgoing.length} out
        </span>
      </button>
      {open ? (
        <div className="grid gap-4 px-4 pb-3 md:grid-cols-3">
          <MentionColumn label="Linked mentions" empty="No linked mentions">
            {linked.map((item) => (
              <button
                key={item.id}
                type="button"
                className="block w-full truncate text-left text-sm text-paper-muted hover:text-paper-fg"
                onClick={() => openWiki(item.title)}
              >
                {displayTitle(item.title)}
                <span className="mt-0.5 block truncate text-xs text-paper-subtle">
                  {snippet(item.content, 64)}
                </span>
              </button>
            ))}
          </MentionColumn>
          <MentionColumn label="Unlinked mentions" empty="No unlinked mentions">
            {unlinked.map((item) => (
              <div key={item.id} className="flex items-start gap-2">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-sm text-paper-muted hover:text-paper-fg"
                  onClick={() => openWiki(item.title)}
                >
                  {displayTitle(item.title)}
                </button>
                <button
                  type="button"
                  className="shrink-0 text-xs text-paper-subtle underline decoration-dotted hover:text-paper-fg"
                  onClick={() =>
                    updateNote(item.id, {
                      content: convertMentionToLink(item.content, displayTitle(note.title)),
                    })
                  }
                >
                  Link
                </button>
              </div>
            ))}
          </MentionColumn>
          <MentionColumn label="Outgoing" empty="No outgoing links">
            {outgoing.map((title) => (
              <button
                key={title}
                type="button"
                className="block w-full truncate text-left text-sm text-paper-muted underline decoration-dotted underline-offset-2 hover:text-paper-fg"
                onClick={() => openWiki(title)}
              >
                {title}
              </button>
            ))}
          </MentionColumn>
        </div>
      ) : null}
    </footer>
  );
}

function MentionColumn({
  label,
  empty,
  children,
}: {
  label: string;
  empty: string;
  children: ReactNode;
}) {
  const has = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div>
      <p className="mb-2 text-xs font-medium tracking-wide text-paper-subtle uppercase">{label}</p>
      {has ? <div className="flex flex-col gap-2">{children}</div> : (
        <p className="text-xs text-paper-subtle">{empty}</p>
      )}
    </div>
  );
}
