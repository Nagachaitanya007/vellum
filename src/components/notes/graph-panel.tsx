import { backlinksTo, displayTitle, extractWikiLinks, findNoteByTitle } from "@/lib/notes/helpers";
import { useActiveNote, useNotesStore } from "@/lib/notes/store";
import { useNotesUi } from "./notes-ui";

export function GraphPanel() {
  const notes = useNotesStore((state) => state.notes);
  const openWiki = useNotesStore((state) => state.openWiki);
  const { isDesktop } = useNotesUi();
  const note = useActiveNote();
  if (!note) return null;

  const outgoing = extractWikiLinks(note.content);
  const incoming = backlinksTo(notes, note);

  if (!isDesktop) {
    return (
      <div className="border-t border-paper-line bg-paper px-4 py-3 text-paper-fg">
        <p className="mb-2 text-xs font-medium tracking-wide text-paper-subtle uppercase">
          Local graph
        </p>
        {incoming.length === 0 && outgoing.length === 0 ? (
          <p className="text-xs text-paper-muted">
            Link this page with [[brackets]] to grow the graph.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {incoming.map((item) => (
              <li key={`in-${item.id}`}>
                <button
                  type="button"
                  className="text-sm underline decoration-dotted underline-offset-2 hover:text-paper-fg"
                  onClick={() => openWiki(item.title)}
                >
                  From {displayTitle(item.title)}
                </button>
              </li>
            ))}
            {outgoing.map((title) => (
              <li key={`out-${title}`}>
                <button
                  type="button"
                  className="text-sm underline decoration-dotted underline-offset-2 hover:text-paper-fg"
                  onClick={() => openWiki(title)}
                >
                  To {title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const cx = 220;
  const cy = 110;
  const leftX = 48;
  const rightX = 392;
  const leftYs = spread(incoming.length, cy, 78);
  const rightYs = spread(outgoing.length, cy, 78);

  return (
    <div className="border-t border-paper-line bg-paper px-3 py-3 text-paper-fg">
      <p className="mb-2 px-1 text-xs font-medium tracking-wide text-paper-subtle uppercase">
        Local graph
      </p>
      <svg
        viewBox="0 0 440 220"
        className="h-44 w-full"
        role="img"
        aria-label="Notes linked to the current page"
      >
        {incoming.map((item, index) => (
          <line
            key={`in-l-${item.id}`}
            x1={leftX + 36}
            y1={leftYs[index]}
            x2={cx - 42}
            y2={cy}
            className="stroke-paper-line"
            strokeWidth="1"
          />
        ))}
        {outgoing.map((title, index) => (
          <line
            key={`out-l-${title}`}
            x1={cx + 42}
            y1={cy}
            x2={rightX - 36}
            y2={rightYs[index]}
            className="stroke-paper-line"
            strokeWidth="1"
          />
        ))}
        <GraphNode x={cx} y={cy} label={displayTitle(note.title)} current />
        {incoming.map((item, index) => (
          <GraphNode
            key={item.id}
            x={leftX}
            y={leftYs[index] ?? cy}
            label={displayTitle(item.title)}
            side="left"
            onClick={() => openWiki(item.title)}
          />
        ))}
        {outgoing.map((title, index) => {
          const exists = Boolean(findNoteByTitle(notes, title));
          return (
            <GraphNode
              key={title}
              x={rightX}
              y={rightYs[index] ?? cy}
              label={title}
              side="right"
              missing={!exists}
              onClick={() => openWiki(title)}
            />
          );
        })}
      </svg>
      {incoming.length === 0 && outgoing.length === 0 ? (
        <p className="px-1 text-xs text-paper-muted">
          Link this page with [[brackets]] to grow the graph.
        </p>
      ) : null}
    </div>
  );
}

function spread(count: number, center: number, span: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [center];
  const start = center - span;
  const step = (span * 2) / (count - 1);
  return Array.from({ length: count }, (_, i) => start + i * step);
}

function GraphNode({
  x,
  y,
  label,
  current,
  missing,
  side,
  onClick,
}: {
  x: number;
  y: number;
  label: string;
  current?: boolean;
  missing?: boolean;
  side?: "left" | "right";
  onClick?: () => void;
}) {
  const short = label.length > 18 ? `${label.slice(0, 16)}…` : label;
  const textX = side === "left" ? x - 14 : side === "right" ? x + 14 : x;
  const textY = side ? y + 4 : y + 22;
  const anchor = side === "left" ? "end" : side === "right" ? "start" : "middle";
  return (
    <g
      className={onClick ? "cursor-pointer" : undefined}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <circle cx={x} cy={y} r={14} fill="transparent" />
      <circle
        cx={x}
        cy={y}
        r={current ? 10 : 7}
        className={
          current ? "fill-paper-fg" : missing ? "fill-paper-subtle" : "fill-paper-muted"
        }
      />
      <text
        x={textX}
        y={textY}
        textAnchor={anchor}
        fill="currentColor"
        fontSize={10}
        fontFamily="var(--font-sans)"
      >
        {short}
      </text>
    </g>
  );
}
