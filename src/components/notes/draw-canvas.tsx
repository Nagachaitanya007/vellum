import {
  Eraser,
  Hand,
  Highlighter,
  Minus,
  Pencil,
  Square,
  Trash2,
  Undo2,
  MoveUpRight,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import {
  DRAW_COLORS,
  emptyDrawing,
  newStrokeId,
  resolveDrawColor,
  strokeHits,
} from "@/lib/notes/drawing";
import { useNotesStore } from "@/lib/notes/store";
import type { DrawColor, DrawTool, Drawing, Stroke, StrokeTool } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

const TOOLS: { id: DrawTool; label: string; icon: typeof Pencil }[] = [
  { id: "pen", label: "Pen", icon: Pencil },
  { id: "highlighter", label: "Highlighter", icon: Highlighter },
  { id: "eraser", label: "Eraser", icon: Eraser },
  { id: "line", label: "Line", icon: Minus },
  { id: "rect", label: "Rectangle", icon: Square },
  { id: "arrow", label: "Arrow", icon: MoveUpRight },
  { id: "hand", label: "Pan", icon: Hand },
];

const SIZES = [2, 4, 8];

export function DrawCanvas({ noteId, drawing }: { noteId: string; drawing: Drawing }) {
  const updateDrawing = useNotesStore((state) => state.updateDrawing);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(drawing);
  const camRef = useRef({ x: 0, y: 0, scale: 1 });
  const spaceRef = useRef(false);
  const [tool, setTool] = useState<DrawTool>("pen");
  const [color, setColor] = useState<DrawColor>("ink");
  const [size, setSize] = useState(2);
  const undoRef = useRef<Drawing[]>([]);
  const previewRef = useRef<Stroke | null>(null);

  drawingRef.current = drawing;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.code === "Space") spaceRef.current = event.type === "keydown";
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

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

    function token(name: string, fallback: string) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    }

    function world(offsetX: number, offsetY: number) {
      const cam = camRef.current;
      return { x: (offsetX - cam.x) / cam.scale, y: (offsetY - cam.y) / cam.scale };
    }

    function paint() {
      if (!running) return;
      const rect = board.getBoundingClientRect();
      const paper = token("--color-paper", "#1a1916");
      const line = token("--color-paper-line", "#2c2a27");
      const ink = token("--color-paper-fg", "#f4f1ea");
      const cam = camRef.current;
      context.clearRect(0, 0, rect.width, rect.height);
      context.fillStyle = paper;
      context.fillRect(0, 0, rect.width, rect.height);
      context.save();
      context.translate(cam.x, cam.y);
      context.scale(cam.scale, cam.scale);
      drawGrid(context, rect, cam, line);
      const strokes = drawingRef.current.strokes;
      for (const stroke of strokes) drawStroke(context, stroke, ink);
      if (previewRef.current) drawStroke(context, previewRef.current, ink);
      context.restore();
      frame = requestAnimationFrame(paint);
    }
    frame = requestAnimationFrame(paint);

    type Drag =
      | { kind: "pan"; lx: number; ly: number }
      | { kind: "draw"; stroke: Stroke }
      | { kind: "shape"; startX: number; startY: number; tool: StrokeTool }
      | { kind: "erase" };
    let drag: Drag | null = null;

    function commit(next: Drawing) {
      undoRef.current = [...undoRef.current.slice(-29), drawingRef.current];
      updateDrawing(noteId, next);
    }

    function onPointerDown(event: PointerEvent) {
      surface.setPointerCapture(event.pointerId);
      const w = world(event.offsetX, event.offsetY);
      const pan = tool === "hand" || spaceRef.current || event.button === 1;
      if (pan) {
        drag = { kind: "pan", lx: event.offsetX, ly: event.offsetY };
        return;
      }
      if (tool === "eraser") {
        drag = { kind: "erase" };
        const nextStrokes = drawingRef.current.strokes.filter(
          (stroke) => !strokeHits(stroke, w.x, w.y, Math.max(12, size * 4)),
        );
        if (nextStrokes.length !== drawingRef.current.strokes.length) {
          commit({ strokes: nextStrokes });
        }
        return;
      }
      if (tool === "line" || tool === "rect" || tool === "arrow") {
        drag = { kind: "shape", startX: w.x, startY: w.y, tool };
        return;
      }
      const stroke: Stroke = {
        id: newStrokeId(),
        tool: tool === "highlighter" ? "highlighter" : "pen",
        color,
        size: tool === "highlighter" ? Math.max(size * 3, 10) : size,
        points: [w.x, w.y],
      };
      drag = { kind: "draw", stroke };
      previewRef.current = stroke;
    }

    function onPointerMove(event: PointerEvent) {
      if (!drag) return;
      const w = world(event.offsetX, event.offsetY);
      if (drag.kind === "pan") {
        camRef.current.x += event.offsetX - drag.lx;
        camRef.current.y += event.offsetY - drag.ly;
        drag.lx = event.offsetX;
        drag.ly = event.offsetY;
        return;
      }
      if (drag.kind === "erase") {
        const nextStrokes = drawingRef.current.strokes.filter(
          (stroke) => !strokeHits(stroke, w.x, w.y, Math.max(12, size * 4)),
        );
        if (nextStrokes.length !== drawingRef.current.strokes.length) {
          commit({ strokes: nextStrokes });
        }
        return;
      }
      if (drag.kind === "draw") {
        drag.stroke.points.push(w.x, w.y);
        previewRef.current = drag.stroke;
        return;
      }
      previewRef.current = {
        id: "preview",
        tool: drag.tool,
        color,
        size,
        points: [drag.startX, drag.startY, w.x, w.y],
      };
    }

    function onPointerUp(event: PointerEvent) {
      if (!drag) return;
      const w = world(event.offsetX, event.offsetY);
      if (drag.kind === "draw") {
        commit({ strokes: [...drawingRef.current.strokes, drag.stroke] });
      } else if (drag.kind === "shape") {
        commit({
          strokes: [
            ...drawingRef.current.strokes,
            {
              id: newStrokeId(),
              tool: drag.tool,
              color,
              size,
              points: [drag.startX, drag.startY, w.x, w.y],
            },
          ],
        });
      }
      previewRef.current = null;
      drag = null;
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.92 : 1.08;
      const next = Math.min(4, Math.max(0.25, camRef.current.scale * factor));
      const w = world(event.offsetX, event.offsetY);
      camRef.current.scale = next;
      camRef.current.x = event.offsetX - w.x * next;
      camRef.current.y = event.offsetY - w.y * next;
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
  }, [color, noteId, size, tool, updateDrawing]);

  function undo() {
    const prev = undoRef.current.pop();
    if (prev) updateDrawing(noteId, prev);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-paper-line px-3 py-2">
        {TOOLS.map((item) => {
          const Icon = item.icon;
          return (
            <Hint key={item.id} label={item.label}>
              <button
                type="button"
                aria-label={item.label}
                aria-pressed={tool === item.id}
                onClick={() => setTool(item.id)}
                className={cn(
                  "inline-flex size-9 items-center justify-center rounded-sm text-paper-muted",
                  tool === item.id ? "bg-paper-hover text-paper-fg" : "hover:text-paper-fg",
                )}
              >
                <Icon className="size-4" />
              </button>
            </Hint>
          );
        })}
        <span className="mx-1 h-5 w-px bg-paper-line" />
        {DRAW_COLORS.map((item) => (
          <button
            key={item}
            type="button"
            aria-label={item}
            aria-pressed={color === item}
            onClick={() => setColor(item)}
            className={cn(
              "size-7 rounded-full border border-paper-line",
              color === item && "outline outline-2 outline-offset-2 outline-paper-fg",
            )}
            style={{
              background:
                item === "ink"
                  ? "var(--color-paper-fg)"
                  : `var(--color-draw-${item === "highlight" ? "highlight" : item})`,
            }}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-paper-line" />
        {SIZES.map((item) => (
          <button
            key={item}
            type="button"
            aria-label={`Size ${item}`}
            onClick={() => setSize(item)}
            className={cn(
              "inline-flex size-9 items-center justify-center rounded-sm text-paper-muted",
              size === item ? "bg-paper-hover text-paper-fg" : "hover:text-paper-fg",
            )}
          >
            <span
              className="rounded-full bg-current"
              style={{ width: item + 4, height: item + 4 }}
            />
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1">
          <Hint label="Undo">
            <Button
              variant="quiet"
              size="icon-sm"
              className="text-paper-muted hover:bg-paper-hover hover:text-paper-fg"
              onClick={undo}
              aria-label="Undo stroke"
            >
              <Undo2 />
            </Button>
          </Hint>
          <Hint label="Clear canvas">
            <Button
              variant="quiet"
              size="icon-sm"
              className="text-paper-muted hover:bg-paper-hover hover:text-paper-fg"
              onClick={() => {
                undoRef.current = [...undoRef.current, drawingRef.current];
                updateDrawing(noteId, emptyDrawing());
              }}
              aria-label="Clear canvas"
            >
              <Trash2 />
            </Button>
          </Hint>
        </span>
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none"
          aria-label="Infinite drawing canvas"
        />
        <p className="pointer-events-none absolute bottom-3 left-4 text-xs text-paper-subtle">
          Infinite canvas · wheel to zoom · space or hand to pan
        </p>
      </div>
    </div>
  );
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  rect: DOMRect,
  cam: { x: number; y: number; scale: number },
  line: string,
) {
  const step = 48;
  const left = (-cam.x) / cam.scale;
  const top = (-cam.y) / cam.scale;
  const right = (rect.width - cam.x) / cam.scale;
  const bottom = (rect.height - cam.y) / cam.scale;
  ctx.beginPath();
  ctx.strokeStyle = line;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1 / cam.scale;
  const startX = Math.floor(left / step) * step;
  const startY = Math.floor(top / step) * step;
  for (let x = startX; x < right; x += step) {
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
  }
  for (let y = startY; y < bottom; y += step) {
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, ink: string) {
  const pts = stroke.points;
  if (pts.length < 2) return;
  const color = resolveDrawColor(stroke.color, ink);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = stroke.tool === "highlighter" ? 0.35 : 1;
  ctx.lineWidth = stroke.size;
  if (stroke.tool === "rect") {
    const x1 = pts[0] ?? 0;
    const y1 = pts[1] ?? 0;
    const x2 = pts[2] ?? x1;
    const y2 = pts[3] ?? y1;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    ctx.globalAlpha = 1;
    return;
  }
  ctx.beginPath();
  ctx.moveTo(pts[0] ?? 0, pts[1] ?? 0);
  if (stroke.tool === "line" || stroke.tool === "arrow") {
    ctx.lineTo(pts[2] ?? pts[0] ?? 0, pts[3] ?? pts[1] ?? 0);
    ctx.stroke();
    if (stroke.tool === "arrow") {
      const x1 = pts[0] ?? 0;
      const y1 = pts[1] ?? 0;
      const x2 = pts[2] ?? x1;
      const y2 = pts[3] ?? y1;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = 10 + stroke.size;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(angle - 0.4), y2 - head * Math.sin(angle - 0.4));
      ctx.lineTo(x2 - head * Math.cos(angle + 0.4), y2 - head * Math.sin(angle + 0.4));
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }
  if (pts.length === 2) {
    ctx.lineTo((pts[0] ?? 0) + 0.1, pts[1] ?? 0);
  } else {
    for (let i = 2; i < pts.length; i += 2) {
      ctx.lineTo(pts[i] ?? 0, pts[i + 1] ?? 0);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}
