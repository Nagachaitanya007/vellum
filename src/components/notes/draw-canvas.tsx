import {
  Circle,
  Diamond,
  Eraser,
  Hand,
  Highlighter,
  Minus,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  MoveUpRight,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import {
  DRAW_COLORS,
  constrainEnd,
  emptyDrawing,
  exportDrawingImage,
  hitTopStroke,
  newStrokeId,
  paintGrid,
  paintSelection,
  paintStroke,
  textFontSize,
  translateStroke,
} from "@/lib/notes/drawing";
import { displayTitle } from "@/lib/notes/helpers";
import { useNotesStore } from "@/lib/notes/store";
import type { DrawColor, DrawTool, Drawing, Stroke, StrokeTool } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

const TOOLS: { id: DrawTool; label: string; icon: typeof Pencil; key?: string }[] = [
  { id: "select", label: "Select", icon: MousePointer2, key: "V" },
  { id: "pen", label: "Pen", icon: Pencil, key: "P" },
  { id: "highlighter", label: "Highlighter", icon: Highlighter, key: "G" },
  { id: "eraser", label: "Eraser", icon: Eraser, key: "E" },
  { id: "line", label: "Line", icon: Minus, key: "L" },
  { id: "arrow", label: "Arrow", icon: MoveUpRight, key: "A" },
  { id: "rect", label: "Rectangle", icon: Square, key: "R" },
  { id: "ellipse", label: "Ellipse", icon: Circle, key: "O" },
  { id: "diamond", label: "Diamond", icon: Diamond, key: "D" },
  { id: "text", label: "Text", icon: Type, key: "T" },
  { id: "hand", label: "Pan", icon: Hand, key: "H" },
];

const SHAPE_TOOLS: StrokeTool[] = ["line", "rect", "ellipse", "diamond", "arrow"];
const SIZES = [2, 4, 8];

type TextEdit = { x: number; y: number; sx: number; sy: number; size: number; color: DrawColor };

export function DrawCanvas({
  noteId,
  drawing,
  title,
}: {
  noteId: string;
  drawing: Drawing;
  title?: string;
}) {
  const updateDrawing = useNotesStore((state) => state.updateDrawing);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(drawing);
  const camRef = useRef({ x: 0, y: 0, scale: 1 });
  const spaceRef = useRef(false);
  const toolRef = useRef<DrawTool>("select");
  const colorRef = useRef<DrawColor>("ink");
  const sizeRef = useRef(2);
  const selectedRef = useRef<string | null>(null);
  const previewRef = useRef<Stroke | null>(null);
  const hiddenIdsRef = useRef<Set<string>>(new Set());
  const moveDeltaRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const undoRef = useRef<Drawing[]>([]);
  const redoRef = useRef<Drawing[]>([]);
  const markDirtyRef = useRef<() => void>(() => undefined);
  const [tool, setTool] = useState<DrawTool>("select");
  const [color, setColor] = useState<DrawColor>("ink");
  const [size, setSize] = useState(2);
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const undoFnRef = useRef<() => void>(() => undefined);
  const redoFnRef = useRef<() => void>(() => undefined);
  const deleteFnRef = useRef<() => void>(() => undefined);

  drawingRef.current = drawing;
  toolRef.current = tool;
  colorRef.current = color;
  sizeRef.current = size;

  function syncStacks() {
    setCanUndo(undoRef.current.length > 0);
    setCanRedo(redoRef.current.length > 0);
  }

  function commit(next: Drawing) {
    undoRef.current = [...undoRef.current.slice(-39), drawingRef.current];
    redoRef.current = [];
    updateDrawing(noteId, next);
    syncStacks();
    markDirtyRef.current();
  }

  function undo() {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current = [...redoRef.current, drawingRef.current];
    selectedRef.current = null;
    updateDrawing(noteId, prev);
    syncStacks();
    markDirtyRef.current();
  }

  function redo() {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current = [...undoRef.current, drawingRef.current];
    selectedRef.current = null;
    updateDrawing(noteId, next);
    syncStacks();
    markDirtyRef.current();
  }

  undoFnRef.current = undo;
  redoFnRef.current = redo;
  deleteFnRef.current = () => {
    const id = selectedRef.current;
    if (!id) return;
    commit({ strokes: drawingRef.current.strokes.filter((stroke) => stroke.id !== id) });
    selectedRef.current = null;
  };

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
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoFnRef.current();
        else undoFnRef.current();
        return;
      }
      if (meta && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoFnRef.current();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        if (!selectedRef.current) return;
        event.preventDefault();
        deleteFnRef.current();
        return;
      }
      if (event.key === "Escape") {
        selectedRef.current = null;
        setTextEdit(null);
        markDirtyRef.current();
        return;
      }
      if (meta) return;
      const hit = TOOLS.find((item) => item.key && item.key.toLowerCase() === event.key.toLowerCase());
      if (hit) {
        event.preventDefault();
        setTool(hit.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    const board = wrap;
    const surface = canvas;
    const context = ctx;
    let frame = 0;
    let running = true;
    let dirty = true;
    let booted = false;

    function resize() {
      const rect = board.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      surface.width = Math.max(1, Math.floor(rect.width * dpr));
      surface.height = Math.max(1, Math.floor(rect.height * dpr));
      surface.style.width = `${rect.width}px`;
      surface.style.height = `${rect.height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!booted) {
        camRef.current.x = rect.width / 2;
        camRef.current.y = rect.height / 2;
        booted = true;
      }
      dirty = true;
      schedule();
    }

    function schedule() {
      if (!running || frame) return;
      frame = requestAnimationFrame(paint);
    }

    function markDirty() {
      dirty = true;
      schedule();
    }
    markDirtyRef.current = markDirty;

    function token(name: string, fallback: string) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
    }

    function world(offsetX: number, offsetY: number) {
      const cam = camRef.current;
      return { x: (offsetX - cam.x) / cam.scale, y: (offsetY - cam.y) / cam.scale };
    }

    function paint() {
      frame = 0;
      if (!running) return;
      if (!dirty) return;
      dirty = false;
      const rect = board.getBoundingClientRect();
      const paper = token("--color-paper", "#1a1916");
      const line = token("--color-paper-line", "#2c2a27");
      const ink = token("--color-paper-fg", "#f4f1ea");
      const cam = camRef.current;
      context.fillStyle = paper;
      context.fillRect(0, 0, rect.width, rect.height);
      context.save();
      context.translate(cam.x, cam.y);
      context.scale(cam.scale, cam.scale);
      paintGrid(context, rect, cam, line);
      const hidden = hiddenIdsRef.current;
      const move = moveDeltaRef.current;
      for (const stroke of drawingRef.current.strokes) {
        if (hidden.has(stroke.id)) continue;
        const drawn =
          move && stroke.id === move.id ? translateStroke(stroke, move.dx, move.dy) : stroke;
        paintStroke(context, drawn, ink);
      }
      if (previewRef.current) paintStroke(context, previewRef.current, ink);
      const selectedId = selectedRef.current;
      if (selectedId) {
        const selected = drawingRef.current.strokes.find((stroke) => stroke.id === selectedId);
        if (selected) {
          const drawn = move && selected.id === move.id ? translateStroke(selected, move.dx, move.dy) : selected;
          paintSelection(context, drawn, ink);
        }
      }
      context.restore();
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    type Drag =
      | { kind: "pan"; lx: number; ly: number }
      | { kind: "draw"; stroke: Stroke }
      | { kind: "shape"; startX: number; startY: number; tool: StrokeTool }
      | { kind: "erase"; ids: Set<string> }
      | { kind: "move"; id: string; x: number; y: number; moved: boolean };

    let drag: Drag | null = null;

    function onPointerDown(event: PointerEvent) {
      if (event.button === 2) return;
      surface.setPointerCapture(event.pointerId);
      const w = world(event.offsetX, event.offsetY);
      const currentTool = toolRef.current;
      const pan = currentTool === "hand" || spaceRef.current || event.button === 1;
      if (pan) {
        drag = { kind: "pan", lx: event.offsetX, ly: event.offsetY };
        surface.style.cursor = "grabbing";
        return;
      }
      if (currentTool === "select") {
        const hit = hitTopStroke(drawingRef.current.strokes, w.x, w.y);
        selectedRef.current = hit?.id ?? null;
        if (hit) {
          drag = { kind: "move", id: hit.id, x: w.x, y: w.y, moved: false };
        }
        markDirty();
        return;
      }
      selectedRef.current = null;
      if (currentTool === "eraser") {
        const ids = new Set<string>();
        const hit = hitTopStroke(drawingRef.current.strokes, w.x, w.y, Math.max(12, sizeRef.current * 4));
        if (hit) ids.add(hit.id);
        hiddenIdsRef.current = ids;
        drag = { kind: "erase", ids };
        markDirty();
        return;
      }
      if (currentTool === "text") {
        drag = { kind: "shape", startX: w.x, startY: w.y, tool: "text" };
        return;
      }
      if (SHAPE_TOOLS.includes(currentTool as StrokeTool)) {
        drag = { kind: "shape", startX: w.x, startY: w.y, tool: currentTool as StrokeTool };
        return;
      }
      const stroke: Stroke = {
        id: newStrokeId(),
        tool: currentTool === "highlighter" ? "highlighter" : "pen",
        color: colorRef.current,
        size: currentTool === "highlighter" ? Math.max(sizeRef.current * 3, 10) : sizeRef.current,
        points: [w.x, w.y],
      };
      drag = { kind: "draw", stroke };
      previewRef.current = stroke;
      markDirty();
    }

    function onPointerMove(event: PointerEvent) {
      if (!drag) return;
      const w = world(event.offsetX, event.offsetY);
      if (drag.kind === "pan") {
        camRef.current.x += event.offsetX - drag.lx;
        camRef.current.y += event.offsetY - drag.ly;
        drag.lx = event.offsetX;
        drag.ly = event.offsetY;
        markDirty();
        return;
      }
      if (drag.kind === "erase") {
        const hit = hitTopStroke(
          drawingRef.current.strokes,
          w.x,
          w.y,
          Math.max(12, sizeRef.current * 4),
        );
        if (hit && !drag.ids.has(hit.id)) {
          drag.ids.add(hit.id);
          hiddenIdsRef.current = drag.ids;
          markDirty();
        }
        return;
      }
      if (drag.kind === "move") {
        const dx = w.x - drag.x;
        const dy = w.y - drag.y;
        if (Math.hypot(dx, dy) > 1) drag.moved = true;
        moveDeltaRef.current = { id: drag.id, dx, dy };
        markDirty();
        return;
      }
      if (drag.kind === "draw") {
        const pts = drag.stroke.points;
        const lastX = pts[pts.length - 2] ?? w.x;
        const lastY = pts[pts.length - 1] ?? w.y;
        if (Math.hypot(w.x - lastX, w.y - lastY) < 1.25) return;
        drag.stroke.points.push(w.x, w.y);
        previewRef.current = drag.stroke;
        markDirty();
        return;
      }
      if (drag.tool === "text") return;
      const end = constrainEnd(drag.tool, drag.startX, drag.startY, w.x, w.y, event.shiftKey);
      previewRef.current = {
        id: "preview",
        tool: drag.tool,
        color: colorRef.current,
        size: sizeRef.current,
        points: [drag.startX, drag.startY, end.x, end.y],
      };
      markDirty();
    }

    function onPointerUp(event: PointerEvent) {
      if (!drag) return;
      const w = world(event.offsetX, event.offsetY);
      surface.style.cursor = "";
      if (drag.kind === "draw") {
        commit({ strokes: [...drawingRef.current.strokes, drag.stroke] });
      } else if (drag.kind === "shape") {
        if (drag.tool === "text") {
          const cam = camRef.current;
          setTextEdit({
            x: drag.startX,
            y: drag.startY,
            sx: drag.startX * cam.scale + cam.x,
            sy: drag.startY * cam.scale + cam.y - textFontSize(sizeRef.current),
            size: sizeRef.current,
            color: colorRef.current,
          });
        } else {
          const end = constrainEnd(drag.tool, drag.startX, drag.startY, w.x, w.y, event.shiftKey);
          if (Math.hypot(end.x - drag.startX, end.y - drag.startY) > 3) {
            commit({
              strokes: [
                ...drawingRef.current.strokes,
                {
                  id: newStrokeId(),
                  tool: drag.tool,
                  color: colorRef.current,
                  size: sizeRef.current,
                  points: [drag.startX, drag.startY, end.x, end.y],
                },
              ],
            });
          }
        }
      } else if (drag.kind === "erase") {
        const erased = drag.ids;
        if (erased.size > 0) {
          commit({
            strokes: drawingRef.current.strokes.filter((stroke) => !erased.has(stroke.id)),
          });
        }
      } else if (drag.kind === "move" && drag.moved) {
        const movedId = drag.id;
        const dx = w.x - drag.x;
        const dy = w.y - drag.y;
        commit({
          strokes: drawingRef.current.strokes.map((stroke) =>
            stroke.id === movedId ? translateStroke(stroke, dx, dy) : stroke,
          ),
        });
      }
      previewRef.current = null;
      hiddenIdsRef.current = new Set();
      moveDeltaRef.current = null;
      drag = null;
      markDirty();
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.92 : 1.08;
      const next = Math.min(4, Math.max(0.25, camRef.current.scale * factor));
      const w = world(event.offsetX, event.offsetY);
      camRef.current.scale = next;
      camRef.current.x = event.offsetX - w.x * next;
      camRef.current.y = event.offsetY - w.y * next;
      markDirty();
    }

    surface.addEventListener("pointerdown", onPointerDown);
    surface.addEventListener("pointermove", onPointerMove);
    surface.addEventListener("pointerup", onPointerUp);
    surface.addEventListener("pointercancel", onPointerUp);
    surface.addEventListener("wheel", onWheel, { passive: false });
    markDirty();
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      ro.disconnect();
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", onPointerUp);
      surface.removeEventListener("pointercancel", onPointerUp);
      surface.removeEventListener("wheel", onWheel);
    };
  }, [noteId, updateDrawing]);

  useEffect(() => {
    undoRef.current = [];
    redoRef.current = [];
    selectedRef.current = null;
    setCanUndo(false);
    setCanRedo(false);
    markDirtyRef.current();
  }, [noteId]);

  useEffect(() => {
    markDirtyRef.current();
  }, [drawing, tool]);

  function finishText(value: string) {
    const edit = textEdit;
    setTextEdit(null);
    const trimmed = value.trim();
    if (!edit || !trimmed) return;
    commit({
      strokes: [
        ...drawingRef.current.strokes,
        {
          id: newStrokeId(),
          tool: "text",
          color: edit.color,
          size: edit.size,
          points: [edit.x, edit.y],
          text: trimmed,
        },
      ],
    });
  }

  const fileTitle = displayTitle(title ?? "");
  const cursor =
    tool === "hand" ? "grab" : tool === "text" ? "text" : tool === "select" ? "default" : "crosshair";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-paper-line px-2 py-2 lg:px-3">
        {TOOLS.map((item) => {
          const Icon = item.icon;
          return (
            <Hint key={item.id} label={item.key ? `${item.label} (${item.key})` : item.label}>
              <button
                type="button"
                aria-label={item.label}
                aria-pressed={tool === item.id}
                onClick={() => setTool(item.id)}
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-sm text-paper-muted lg:size-9",
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
        <span className="ml-auto flex flex-wrap items-center gap-1">
          <Hint label="Undo">
            <Button
              variant="quiet"
              size="icon-sm"
              className="text-paper-muted hover:bg-paper-hover hover:text-paper-fg"
              onClick={undo}
              disabled={!canUndo}
              aria-label="Undo"
            >
              <Undo2 />
            </Button>
          </Hint>
          <Hint label="Redo">
            <Button
              variant="quiet"
              size="icon-sm"
              className="text-paper-muted hover:bg-paper-hover hover:text-paper-fg"
              onClick={redo}
              disabled={!canRedo}
              aria-label="Redo"
            >
              <Redo2 />
            </Button>
          </Hint>
          <Button
            variant="quiet"
            size="sm"
            className="h-9 px-2 text-paper-muted hover:bg-paper-hover hover:text-paper-fg"
            onClick={() => void exportDrawingImage(drawingRef.current, fileTitle, "png")}
          >
            PNG
          </Button>
          <Button
            variant="quiet"
            size="sm"
            className="h-9 px-2 text-paper-muted hover:bg-paper-hover hover:text-paper-fg"
            onClick={() => void exportDrawingImage(drawingRef.current, fileTitle, "jpeg")}
          >
            JPEG
          </Button>
          <Hint label="Clear canvas">
            <Button
              variant="quiet"
              size="icon-sm"
              className="text-paper-muted hover:bg-paper-hover hover:text-paper-fg"
              onClick={() => {
                if (drawingRef.current.strokes.length === 0) return;
                commit(emptyDrawing());
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
          style={{ cursor }}
          aria-label="Infinite drawing canvas"
        />
        {textEdit ? (
          <input
            autoFocus
            defaultValue=""
            aria-label="Canvas text"
            className="absolute min-w-40 bg-transparent font-serif text-paper-fg outline-none"
            style={{
              left: textEdit.sx,
              top: textEdit.sy,
              fontSize: textFontSize(textEdit.size),
            }}
            onBlur={(event) => finishText(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                finishText(event.currentTarget.value);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setTextEdit(null);
              }
            }}
          />
        ) : null}
        <p className="pointer-events-none absolute bottom-3 left-4 text-xs text-paper-subtle">
          Select · shapes · text · wheel zoom · space to pan · Shift constrains · PNG / JPEG
        </p>
      </div>
    </div>
  );
}
