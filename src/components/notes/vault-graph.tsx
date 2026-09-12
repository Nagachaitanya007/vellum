import { Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNotesUi } from "@/components/notes/notes-ui";
import { Button } from "@/components/ui/button";
import { buildGraph, displayTitle } from "@/lib/notes/helpers";
import { useNotesStore } from "@/lib/notes/store";

type SimNode = {
  id: string;
  title: string;
  pinned: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export function VaultGraph() {
  const notes = useNotesStore((state) => state.notes);
  const activeId = useNotesStore((state) => state.activeId);
  const selectNote = useNotesStore((state) => state.selectNote);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<{ from: string; to: string }[]>([]);
  const camRef = useRef({ x: 0, y: 0, scale: 1 });
  const hoverRef = useRef<string | null>(null);
  const dragRef = useRef<{ id?: string; lx: number; ly: number; sx: number; sy: number; pan?: boolean } | null>(null);
  const { layout, setSidebarOpen } = useNotesUi();
  const [hoverTitle, setHoverTitle] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const { nodes, edges } = buildGraph(notes);
    const prev = new Map(simRef.current.map((node) => [node.id, node]));
    simRef.current = nodes.map((node, index) => {
      const old = prev.get(node.id);
      const angle = (index / Math.max(nodes.length, 1)) * Math.PI * 2;
      return {
        id: node.id,
        title: node.title,
        pinned: node.pinned,
        x: old?.x ?? Math.cos(angle) * 160,
        y: old?.y ?? Math.sin(angle) * 160,
        vx: old?.vx ?? 0,
        vy: old?.vy ?? 0,
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

    function color(name: string, fallback: string) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    }

    function tick() {
      if (!running) return;
      const nodes = simRef.current;
      const edges = edgesRef.current;
      const n = nodes.length;
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
        const spring = (dist - 140) * 0.018;
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
      const fg = color("--color-paper-fg", "#f4f1ea");
      const muted = color("--color-paper-muted", "#9c9890");
      const line = color("--color-paper-line", "#2c2a27");
      const paper = color("--color-paper", "#1a1916");
      const cam = camRef.current;
      context.clearRect(0, 0, rect.width, rect.height);
      context.fillStyle = paper;
      context.fillRect(0, 0, rect.width, rect.height);

      const toScreen = (x: number, y: number) => ({
        x: x * cam.scale + cam.x + rect.width / 2,
        y: y * cam.scale + cam.y + rect.height / 2,
      });

      context.lineWidth = 1;
      context.strokeStyle = line;
      for (const edge of edges) {
        const a = nodes.find((node) => node.id === edge.from);
        const b = nodes.find((node) => node.id === edge.to);
        if (!a || !b) continue;
        const sa = toScreen(a.x, a.y);
        const sb = toScreen(b.x, b.y);
        context.beginPath();
        context.moveTo(sa.x, sa.y);
        context.lineTo(sb.x, sb.y);
        context.stroke();
      }

      const q = query.trim().toLowerCase();
      for (const node of nodes) {
        const s = toScreen(node.x, node.y);
        const active = node.id === activeId;
        const hover = node.id === hoverRef.current;
        const match = q.length > 0 && node.title.toLowerCase().includes(q);
        const r = active ? 10 : node.pinned ? 8 : 6;
        context.beginPath();
        context.arc(s.x, s.y, r, 0, Math.PI * 2);
        context.fillStyle = active || hover || match ? fg : muted;
        context.fill();
        context.font = "12px 'IBM Plex Sans', sans-serif";
        context.fillStyle = fg;
        context.textAlign = "center";
        context.fillText(node.title.length > 22 ? `${node.title.slice(0, 20)}…` : node.title, s.x, s.y + r + 14);
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
      let bestD = 18 / cam.scale;
      for (const node of simRef.current) {
        const d = Math.hypot(node.x - worldX, node.y - worldY);
        if (d < bestD) {
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

  return (
    <div className="paper-pane flex h-full min-h-0 flex-col bg-paper text-paper-fg">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-paper-line px-3 py-3 lg:px-4">
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
            {notes.length} notes · drag to arrange · scroll to zoom · click to open
          </p>
        </div>
        <label className="relative block w-full sm:w-48">
          <span className="sr-only">Highlight notes</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Highlight"
            className="h-11 w-full rounded-sm bg-paper-hover px-3 text-base text-paper-fg placeholder:text-paper-subtle outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-paper-fg lg:h-9 lg:text-sm"
          />
        </label>
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="block h-full w-full touch-none" aria-label="Notes graph" />
        {hoverTitle ? (
          <p className="pointer-events-none absolute bottom-3 left-4 text-xs text-paper-muted">
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
