import { Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNotesUi } from "@/components/notes/notes-ui";
import { Button } from "@/components/ui/button";
import {
  folderSwatch,
  nodeRadius,
  nodeWeight,
  paintNodeShape,
  type GraphNodeInfo,
} from "@/lib/notes/graph-style";
import { buildGraph, displayTitle } from "@/lib/notes/helpers";
import { useNotesStore } from "@/lib/notes/store";
import type { GraphStyle, NoteKind } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

type SimNode = GraphNodeInfo & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
};

function tokenColor(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function resolveSwatch(
  style: GraphStyle,
  node: { folderId: string | null; kind: NoteKind; pinned: boolean },
  ink: string,
  muted: string,
): string {
  if (style.colorBy === "mono") return ink;
  if (style.colorBy === "pin") {
    return node.pinned
      ? tokenColor("--color-draw-highlight", "#c4a35a")
      : muted;
  }
  if (style.colorBy === "kind") {
    return node.kind === "canvas"
      ? tokenColor("--color-draw-blue", "#6a8eae")
      : ink;
  }
  const swatch = folderSwatch(node.folderId);
  if (swatch === "muted") return muted;
  return tokenColor(`--color-draw-${swatch}`, ink);
}

function edgeStroke(style: GraphStyle, muted: string, ink: string): string {
  if (style.edgeColor === "ink") return ink;
  if (style.edgeColor === "muted") return muted;
  return tokenColor(`--color-draw-${style.edgeColor}`, muted);
}

export function VaultGraph() {
  const notes = useNotesStore((state) => state.notes);
  const folders = useNotesStore((state) => state.folders);
  const activeId = useNotesStore((state) => state.activeId);
  const selectNote = useNotesStore((state) => state.selectNote);
  const graphStyle = useNotesStore((state) => state.graphStyle);
  const setGraphStyle = useNotesStore((state) => state.setGraphStyle);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<{ from: string; to: string }[]>([]);
  const camRef = useRef({ x: 0, y: 0, scale: 1 });
  const hoverRef = useRef<string | null>(null);
  const dragRef = useRef<{ id?: string; lx: number; ly: number; sx: number; sy: number; pan?: boolean } | null>(
    null,
  );
  const styleRef = useRef(graphStyle);
  const { layout, setSidebarOpen } = useNotesUi();
  const [hoverTitle, setHoverTitle] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  styleRef.current = graphStyle;

  useEffect(() => {
    const { nodes, edges } = buildGraph(notes);
    const prev = new Map(simRef.current.map((node) => [node.id, node]));
    simRef.current = nodes.map((node, index) => {
      const old = prev.get(node.id);
      const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
      return {
        ...node,
        x: old?.x ?? Math.cos(angle) * 160,
        y: old?.y ?? Math.sin(angle) * 160,
        vx: old?.vx ?? 0,
        vy: old?.vy ?? 0,
        r: old?.r ?? 8,
      };
    });
    edgesRef.current = edges;
  }, [notes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const board = wrap;
    const surface = canvas;
    const context = ctx;
    let frame = 0;
    let running = true;

    function resize() {
      const rect = board.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      surface.width = Math.max(1, Math.floor(rect.width * dpr));
      surface.height = Math.max(1, Math.floor(rect.height * dpr));
      surface.style.width = `${rect.width}px`;
      surface.style.height = `${rect.height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    function tick() {
      if (!running) return;
      const nodes = simRef.current;
      const edges = edgesRef.current;
      const style = styleRef.current;
      const n = nodes.length;
      const weights = nodes.map((node) => nodeWeight(node, style.sizeBy));
      const minW = Math.min(...weights, 1);
      const maxW = Math.max(...weights, 1);
      for (let i = 0; i < n; i += 1) {
        const node = nodes[i];
        const weight = weights[i] ?? 1;
        if (node) node.r = nodeRadius(weight, minW, maxW);
      }
      for (let i = 0; i < n; i += 1) {
        const a = nodes[i];
        if (!a) continue;
        for (let j = i + 1; j < n; j += 1) {
          const b = nodes[j];
          if (!b) continue;
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let dist = Math.hypot(dx, dy) || 0.1;
          const force = 1400 / (dist * dist);
          dx /= dist;
          dy /= dist;
          a.vx += dx * force;
          a.vy += dy * force;
          b.vx -= dx * force;
          b.vy -= dy * force;
        }
      }
      for (const edge of edges) {
        const a = nodes.find((node) => node.id === edge.from);
        const b = nodes.find((node) => node.id === edge.to);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.1;
        const rest = 110 + a.r + b.r;
        const spring = (dist - rest) * 0.018;
        const nx = dx / dist;
        const ny = dy / dist;
        a.vx += nx * spring;
        a.vy += ny * spring;
        b.vx -= nx * spring;
        b.vy -= ny * spring;
      }
      for (const node of nodes) {
        node.vx += -node.x * 0.008;
        node.vy += -node.y * 0.008;
        node.vx *= 0.82;
        node.vy *= 0.82;
        if (dragRef.current?.id !== node.id) {
          node.x += node.vx;
          node.y += node.vy;
        }
      }

      const rect = board.getBoundingClientRect();
      const fg = tokenColor("--color-paper-fg", "#f4f1ea");
      const muted = tokenColor("--color-paper-muted", "#9c9890");
      const paper = tokenColor("--color-paper", "#1a1916");
      const cam = camRef.current;
      context.clearRect(0, 0, rect.width, rect.height);
      context.fillStyle = paper;
      context.fillRect(0, 0, rect.width, rect.height);

      const toScreen = (x: number, y: number) => ({
        x: x * cam.scale + cam.x + rect.width / 2,
        y: y * cam.scale + cam.y + rect.height / 2,
      });

      const stroke = edgeStroke(style, muted, fg);
      context.strokeStyle = stroke;
      context.fillStyle = stroke;
      context.lineWidth = style.edgeWidth;
      if (style.edgeStyle === "dashed") context.setLineDash([6, 5]);
      else context.setLineDash([]);

      for (const edge of edges) {
        const a = nodes.find((node) => node.id === edge.from);
        const b = nodes.find((node) => node.id === edge.to);
        if (!a || !b) continue;
        const sa = toScreen(a.x, a.y);
        const sb = toScreen(b.x, b.y);
        const dx = sb.x - sa.x;
        const dy = sb.y - sa.y;
        const dist = Math.hypot(dx, dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        const x1 = sa.x + nx * a.r * cam.scale;
        const y1 = sa.y + ny * a.r * cam.scale;
        const x2 = sb.x - nx * b.r * cam.scale;
        const y2 = sb.y - ny * b.r * cam.scale;
        context.beginPath();
        context.moveTo(x1, y1);
        context.lineTo(x2, y2);
        context.stroke();
        if (style.edgeStyle === "arrow") {
          const head = 7 + style.edgeWidth * 2;
          context.beginPath();
          context.moveTo(x2, y2);
          context.lineTo(x2 - head * Math.cos(Math.atan2(dy, dx) - 0.4), y2 - head * Math.sin(Math.atan2(dy, dx) - 0.4));
          context.lineTo(x2 - head * Math.cos(Math.atan2(dy, dx) + 0.4), y2 - head * Math.sin(Math.atan2(dy, dx) + 0.4));
          context.closePath();
          context.fill();
        }
      }
      context.setLineDash([]);

      const q = query.trim().toLowerCase();
      for (const node of nodes) {
        const s = toScreen(node.x, node.y);
        const active = node.id === activeId;
        const hover = node.id === hoverRef.current;
        const match = q.length > 0 && node.title.toLowerCase().includes(q);
        const r = (node.r + (active ? 3 : hover ? 1 : 0)) * cam.scale;
        const fill = resolveSwatch(style, node, fg, muted);
        context.fillStyle = fill;
        paintNodeShape(context, style.nodeShape, s.x, s.y, r);
        context.fill();
        if (active || match) {
          context.strokeStyle = fg;
          context.lineWidth = 2;
          paintNodeShape(context, style.nodeShape, s.x, s.y, r + 3);
          context.stroke();
        }
        context.font = `${node.pinned ? "500 " : ""}12px "IBM Plex Sans", sans-serif`;
        context.fillStyle = fg;
        context.textAlign = "center";
        context.fillText(
          node.title.length > 22 ? `${node.title.slice(0, 20)}…` : node.title,
          s.x,
          s.y + r + 14,
        );
      }

      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);

    function hit(sx: number, sy: number): SimNode | undefined {
      const rect = board.getBoundingClientRect();
      const cam = camRef.current;
      const worldX = (sx - cam.x - rect.width / 2) / cam.scale;
      const worldY = (sy - cam.y - rect.height / 2) / cam.scale;
      let best: SimNode | undefined;
      let bestD = 22 / cam.scale;
      for (const node of simRef.current) {
        const d = Math.hypot(node.x - worldX, node.y - worldY);
        if (d < Math.max(bestD, node.r + 4)) {
          bestD = d;
          best = node;
        }
      }
      return best;
    }

    function onPointerDown(event: PointerEvent) {
      surface.setPointerCapture(event.pointerId);
      const node = hit(event.offsetX, event.offsetY);
      if (node && event.button === 0) {
        dragRef.current = {
          id: node.id,
          lx: event.offsetX,
          ly: event.offsetY,
          sx: event.offsetX,
          sy: event.offsetY,
        };
      } else {
        dragRef.current = { lx: event.offsetX, ly: event.offsetY, sx: event.offsetX, sy: event.offsetY, pan: true };
      }
    }
    function onPointerMove(event: PointerEvent) {
      const node = hit(event.offsetX, event.offsetY);
      hoverRef.current = node?.id ?? null;
      setHoverTitle(node?.title ?? null);
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.offsetX - drag.lx;
      const dy = event.offsetY - drag.ly;
      drag.lx = event.offsetX;
      drag.ly = event.offsetY;
      if (drag.pan) {
        camRef.current.x += dx;
        camRef.current.y += dy;
        return;
      }
      if (drag.id) {
        const sim = simRef.current.find((item) => item.id === drag.id);
        if (!sim) return;
        sim.x += dx / camRef.current.scale;
        sim.y += dy / camRef.current.scale;
        sim.vx = 0;
        sim.vy = 0;
      }
    }
    function onPointerUp(event: PointerEvent) {
      const drag = dragRef.current;
      if (drag?.id && Math.hypot(event.offsetX - drag.sx, event.offsetY - drag.sy) < 5) {
        selectNote(drag.id);
      }
      dragRef.current = null;
    }
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.92 : 1.08;
      const next = Math.min(2.6, Math.max(0.35, camRef.current.scale * factor));
      const rect = board.getBoundingClientRect();
      const wx = (event.offsetX - camRef.current.x - rect.width / 2) / camRef.current.scale;
      const wy = (event.offsetY - camRef.current.y - rect.height / 2) / camRef.current.scale;
      camRef.current.scale = next;
      camRef.current.x = event.offsetX - wx * next - rect.width / 2;
      camRef.current.y = event.offsetY - wy * next - rect.height / 2;
    }

    surface.addEventListener("pointerdown", onPointerDown);
    surface.addEventListener("pointermove", onPointerMove);
    surface.addEventListener("pointerup", onPointerUp);
    surface.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      ro.disconnect();
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", onPointerUp);
      surface.removeEventListener("wheel", onWheel);
    };
  }, [activeId, query, selectNote]);

  const selectClass =
    "h-9 max-w-36 truncate rounded-sm bg-paper-hover px-2 text-sm text-paper-fg outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper-fg";

  return (
    <div className="paper-pane flex h-full min-h-0 flex-col bg-paper text-paper-fg">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-paper-line px-3 py-3 lg:px-4">
        {layout === "tablet" ? (
          <Button
            variant="quiet"
            size="icon"
            className="text-paper-muted hover:bg-paper-hover hover:text-paper-fg"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open library"
          >
            <Menu />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Vault graph</p>
          <p className="hidden text-xs text-paper-muted sm:block">
            {notes.length} notes · larger notes draw larger nodes
          </p>
        </div>
        <label className="relative block w-full sm:w-40">
          <span className="sr-only">Highlight notes</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Highlight"
            className="h-11 w-full rounded-sm bg-paper-hover px-3 text-base text-paper-fg placeholder:text-paper-subtle outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper-fg lg:h-9 lg:text-sm"
          />
        </label>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-paper-line px-3 py-2 lg:px-4">
        <GraphSelect
          label="Shape"
          value={graphStyle.nodeShape}
          className={selectClass}
          onChange={(value) => setGraphStyle({ nodeShape: value as GraphStyle["nodeShape"] })}
          options={[
            { value: "circle", label: "Dots" },
            { value: "square", label: "Squares" },
            { value: "diamond", label: "Diamonds" },
            { value: "hex", label: "Hexagons" },
          ]}
        />
        <GraphSelect
          label="Color"
          value={graphStyle.colorBy}
          className={selectClass}
          onChange={(value) => setGraphStyle({ colorBy: value as GraphStyle["colorBy"] })}
          options={[
            { value: "folder", label: "By folder" },
            { value: "kind", label: "Page / board" },
            { value: "pin", label: "Pinned" },
            { value: "mono", label: "One color" },
          ]}
        />
        <GraphSelect
          label="Size"
          value={graphStyle.sizeBy}
          className={selectClass}
          onChange={(value) => setGraphStyle({ sizeBy: value as GraphStyle["sizeBy"] })}
          options={[
            { value: "words", label: "By length" },
            { value: "links", label: "By links" },
            { value: "uniform", label: "Same size" },
          ]}
        />
        <GraphSelect
          label="Links"
          value={graphStyle.edgeStyle}
          className={selectClass}
          onChange={(value) => setGraphStyle({ edgeStyle: value as GraphStyle["edgeStyle"] })}
          options={[
            { value: "arrow", label: "Arrows" },
            { value: "line", label: "Lines" },
            { value: "dashed", label: "Dashed" },
          ]}
        />
        <GraphSelect
          label="Ink"
          value={graphStyle.edgeColor}
          className={selectClass}
          onChange={(value) => setGraphStyle({ edgeColor: value as GraphStyle["edgeColor"] })}
          options={[
            { value: "muted", label: "Muted" },
            { value: "ink", label: "Ink" },
            { value: "blue", label: "Blue" },
            { value: "green", label: "Green" },
            { value: "red", label: "Red" },
          ]}
        />
        <GraphSelect
          label="Weight"
          value={String(graphStyle.edgeWidth)}
          className={selectClass}
          onChange={(value) =>
            setGraphStyle({ edgeWidth: Number(value) as GraphStyle["edgeWidth"] })
          }
          options={[
            { value: "1", label: "Thin" },
            { value: "2", label: "Medium" },
            { value: "3", label: "Thick" },
          ]}
        />
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="block h-full w-full touch-none" aria-label="Notes graph" />
        {graphStyle.colorBy === "folder" ? (
          <ul className="pointer-events-none absolute bottom-3 left-4 flex flex-wrap gap-3 text-xs text-paper-muted">
            <li className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-paper-muted" />
              Unfiled
            </li>
            {folders.map((folder) => {
              const swatch = folderSwatch(folder.id);
              return (
                <li key={folder.id} className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{
                      background:
                        swatch === "muted"
                          ? "var(--color-paper-muted)"
                          : `var(--color-draw-${swatch})`,
                    }}
                  />
                  {folder.name}
                </li>
              );
            })}
          </ul>
        ) : null}
        {hoverTitle ? (
          <p className="pointer-events-none absolute right-4 bottom-3 text-xs text-paper-muted">
            {hoverTitle}
            {hoverTitle === displayTitle(notes.find((note) => note.id === activeId)?.title ?? "")
              ? " · current"
              : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function GraphSelect({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className: string;
}) {
  const id = `graph-${label.toLowerCase()}`;
  return (
    <label className="flex items-center gap-1.5 text-xs text-paper-muted">
      <span>{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(className)}
        aria-label={label}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
