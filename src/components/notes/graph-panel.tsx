import { X } from "lucide-react";
import { folderSwatch } from "@/lib/notes/graph-style";
import { backlinksTo, displayTitle, extractWikiLinks, findNoteByTitle } from "@/lib/notes/helpers";
import { useActiveNote, useNotesStore } from "@/lib/notes/store";
import type { GraphNodeShape, Note } from "@/lib/notes/types";
import { Button } from "@/components/ui/button";
import { useNotesUi } from "./notes-ui";

export function GraphPanel() {
  const notes = useNotesStore((state) => state.notes);
  const openWiki = useNotesStore((state) => state.openWiki);
  const graphStyle = useNotesStore((state) => state.graphStyle);
  const setGraphOpen = useNotesStore((state) => state.setGraphOpen);
  const { isDesktop } = useNotesUi();
  const note = useActiveNote();
  if (!note) return null;

  const outgoing = extractWikiLinks(note.content);
  const incoming = backlinksTo(notes, note);

  function GraphHeader() {
    return (
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="text-xs font-medium tracking-wide text-paper-subtle uppercase">
          Local graph
        </p>
        <Button
          variant="quiet"
          size="icon-sm"
          className="size-8 text-paper-muted hover:bg-paper-hover hover:text-paper-fg"
          onClick={() => setGraphOpen(false)}
          aria-label="Hide local graph"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }

  if (!isDesktop) {
    return (
      <div className="border-t border-paper-line bg-paper px-4 py-3 text-paper-fg">
        <GraphHeader />
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
  const shape = graphStyle.nodeShape;

  return (
    <div className="border-t border-paper-line bg-paper px-3 py-3 text-paper-fg">
      <GraphHeader />
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
            strokeWidth={graphStyle.edgeWidth}
            strokeDasharray={graphStyle.edgeStyle === "dashed" ? "5 4" : undefined}
            markerEnd={graphStyle.edgeStyle === "arrow" ? "url(#graph-arrow)" : undefined}
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
            strokeWidth={graphStyle.edgeWidth}
            strokeDasharray={graphStyle.edgeStyle === "dashed" ? "5 4" : undefined}
            markerEnd={graphStyle.edgeStyle === "arrow" ? "url(#graph-arrow)" : undefined}
          />
        ))}
        <defs>
          <marker id="graph-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" className="fill-paper-muted" />
          </marker>
        </defs>
        <GraphNode
          x={cx}
          y={cy}
          r={12}
          label={displayTitle(note.title)}
          current
          shape={shape}
          fill={nodeFill(note, graphStyle.colorBy)}
        />
        {incoming.map((item, index) => (
          <GraphNode
            key={item.id}
            x={leftX}
            y={leftYs[index] ?? cy}
            r={Math.max(6, Math.min(12, 5 + displayTitle(item.title).length * 0.15))}
            label={displayTitle(item.title)}
            side="left"
            shape={shape}
            fill={nodeFill(item, graphStyle.colorBy)}
            onClick={() => openWiki(item.title)}
          />
        ))}
        {outgoing.map((title, index) => {
          const exists = findNoteByTitle(notes, title);
          return (
            <GraphNode
              key={title}
              x={rightX}
              y={rightYs[index] ?? cy}
              r={Math.max(6, Math.min(12, 5 + title.length * 0.15))}
              label={title}
              side="right"
              missing={!exists}
              shape={shape}
              fill={exists ? nodeFill(exists, graphStyle.colorBy) : undefined}
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

function nodeFill(note: Note, colorBy: "folder" | "kind" | "pin" | "mono"): string {
  if (colorBy === "mono") return "var(--color-paper-fg)";
  if (colorBy === "pin") {
    return note.pinned ? "var(--color-draw-highlight)" : "var(--color-paper-muted)";
  }
  if (colorBy === "kind") {
    return note.kind === "canvas" ? "var(--color-draw-blue)" : "var(--color-paper-fg)";
  }
  const swatch = folderSwatch(note.folderId);
  if (swatch === "muted") return "var(--color-paper-muted)";
  return `var(--color-draw-${swatch})`;
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
  r,
  label,
  current,
  missing,
  side,
  shape,
  fill,
  onClick,
}: {
  x: number;
  y: number;
  r: number;
  label: string;
  current?: boolean;
  missing?: boolean;
  side?: "left" | "right";
  shape: GraphNodeShape;
  fill?: string;
  onClick?: () => void;
}) {
  const short = label.length > 18 ? `${label.slice(0, 16)}…` : label;
  const textX = side === "left" ? x - 14 : side === "right" ? x + 14 : x;
  const textY = side ? y + 4 : y + 22;
  const anchor = side === "left" ? "end" : side === "right" ? "start" : "middle";
  const color = missing ? "var(--color-paper-subtle)" : fill ?? "var(--color-paper-muted)";
  const radius = current ? r + 2 : r;
  return (
    <g
      className={onClick ? "cursor-pointer" : undefined}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <circle cx={x} cy={y} r={radius + 8} fill="transparent" />
      <NodeMark x={x} y={y} r={radius} shape={shape} fill={color} />
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

function NodeMark({
  x,
  y,
  r,
  shape,
  fill,
}: {
  x: number;
  y: number;
  r: number;
  shape: GraphNodeShape;
  fill: string;
}) {
  if (shape === "square") {
    const s = r * 1.7;
    return <rect x={x - s / 2} y={y - s / 2} width={s} height={s} fill={fill} />;
  }
  if (shape === "diamond") {
    return (
      <polygon
        points={`${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`}
        fill={fill}
      />
    );
  }
  if (shape === "hex") {
    const pts = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      return `${x + Math.cos(a) * r},${y + Math.sin(a) * r}`;
    }).join(" ");
    return <polygon points={pts} fill={fill} />;
  }
  return <circle cx={x} cy={y} r={r} fill={fill} />;
}
