import {
  Circle,
  Diamond,
  Eraser,
  Hand,
  Hexagon,
  Highlighter,
  Minus,
  MousePointer2,
  Pencil,
  Pentagon,
  Redo2,
  Shapes,
  Square,
  Star,
  Trash2,
  Triangle,
  Type,
  Undo2,
  MoveUpRight,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { EXTRA_SHAPES } from "@/lib/notes/diagram-presets";
import {
  constrainEnd,
  cssDrawColor,
  DRAW_COLORS,
  DRAW_FILLS,
  elementBounds,
  emptyDrawing,
  exportDrawingImage,
  hitTopStroke,
  isClosedShape,
  measureTextBlock,
  newStrokeId,
  paintGrid,
  paintSelection,
  paintStroke,
  shapeLabelSize,
  strokeHits,
  textFontSize,
  translateStroke,
} from "@/lib/notes/drawing";
import {
  handleCursor,
  hitHandle,
  isTwoPointTool,
  nudgeStroke,
  resizeStroke,
  type Bounds,
  type TransformHandle,
} from "@/lib/notes/geometry";
import { displayTitle } from "@/lib/notes/helpers";
import { useNotesStore } from "@/lib/notes/store";
import type { DrawColor, DrawFill, DrawTool, Drawing, Stroke, StrokeTool } from "@/lib/notes/types";
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

const EXTRA_ICONS = {
  triangle: Triangle,
  pentagon: Pentagon,
  hexagon: Hexagon,
  star: Star,
} as const;

const SHAPE_TOOLS: StrokeTool[] = [
  "line",
  "rect",
  "ellipse",
  "diamond",
  "arrow",
  "triangle",
  "pentagon",
  "hexagon",
  "star",
];

const SIZES = [2, 4, 8];
const CREATE_DRAG_PX = 14;

type TextEdit = {
  strokeId?: string;
  x: number;
  y: number;
  size: number;
  color: DrawColor;
  value: string;
  shape: boolean;
  font: number;
  wrapWidth?: number;
  shapeBox?: Bounds;
  camX: number;
  camY: number;
  camScale: number;
};

function handleWorldSize(pointerType: string, scale: number) {
  const coarse =
    pointerType === "touch" ||
    pointerType === "pen" ||
    (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const px = coarse ? 24 : 10;
  return px / Math.max(0.2, scale);
}

function ShapesButton({
  extraActive,
  tool,
  open,
  onToggle,
}: {
  extraActive: boolean;
  tool: DrawTool;
  open: boolean;
  onToggle: (el: HTMLElement) => void;
}) {
  const ActiveIcon = extraActive ? (EXTRA_ICONS[tool as keyof typeof EXTRA_ICONS] ?? Shapes) : Shapes;
  return (
    <button
      type="button"
      data-shapes-picker=""
      aria-label="More shapes"
      aria-expanded={open}
      onClick={(event) => onToggle(event.currentTarget)}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-md text-paper-muted lg:size-9 lg:rounded-sm",
        (open || extraActive) ? "bg-paper-hover text-paper-fg" : "hover:text-paper-fg",
      )}
    >
      <ActiveIcon className="size-5 lg:size-4" />
    </button>
  );
}

function ShapesMenu({
  open,
  anchor,
  tool,
  onPick,
}: {
  open: boolean;
  anchor: DOMRect | null;
  tool: DrawTool;
  onPick: (id: DrawTool) => void;
}) {
  if (!open || !anchor || typeof document === "undefined") return null;
  const width = 220;
  const view = viewRect();
  const left = Math.max(view.left + 8, Math.min(anchor.left, view.right - width - 8));
  const menuH = EXTRA_SHAPES.length * 44 + 8;
  const spaceAbove = anchor.top - view.top;
  const spaceBelow = view.bottom - anchor.bottom;
  const openUp = spaceAbove > spaceBelow || spaceBelow < menuH;
  const top = openUp
    ? Math.max(view.top + 8, anchor.top - menuH - 6)
    : Math.min(anchor.bottom + 6, view.bottom - menuH - 8);
  return createPortal(
    <div
      role="menu"
      data-shapes-picker=""
      className="fixed z-50 w-52 overflow-hidden rounded-md bg-raised py-1 text-fg shadow-border"
      style={{ left, top, width }}
    >
      {EXTRA_SHAPES.map((item) => {
        const Icon = EXTRA_ICONS[item.id];
        return (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={cn(
              "flex h-11 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface-hover",
              tool === item.id && "bg-surface-hover",
            )}
            onClick={() => onPick(item.id)}
          >
            <Icon className="size-4 text-muted" />
            <span className="flex-1">{item.label}</span>
            <span className="text-xs text-muted">{item.hint}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

function viewRect() {
  const vv = typeof window === "undefined" ? null : window.visualViewport;
  if (vv) {
    return {
      left: vv.offsetLeft,
      top: vv.offsetTop,
      right: vv.offsetLeft + vv.width,
      bottom: vv.offsetTop + vv.height,
    };
  }
  return {
    left: 0,
    top: 0,
    right: typeof window === "undefined" ? 0 : window.innerWidth,
    bottom: typeof window === "undefined" ? 0 : window.innerHeight,
  };
}

function textOverlayBox(
  edit: TextEdit,
  wrap: HTMLElement,
  cam: { x: number; y: number; scale: number },
  value: string,
) {
  const wrapRect = wrap.getBoundingClientRect();
  const view = viewRect();
  const pad = 8;
  const clipLeft = Math.max(wrapRect.left, view.left) + pad;
  const clipTop = Math.max(wrapRect.top, view.top) + pad;
  const clipRight = Math.min(wrapRect.right, view.right) - pad;
  const clipBottom = Math.min(wrapRect.bottom, view.bottom) - pad;
  const clipW = Math.max(48, clipRight - clipLeft);
  const clipH = Math.max(28, clipBottom - clipTop);
  const scale = cam.scale;
  const fontPx = Math.max(16, edit.font * scale);
  const wrapWidth = edit.wrapWidth ?? (edit.shape ? Math.max(24, (edit.shapeBox?.w ?? 80) - 16) : undefined);
  const measured = measureTextBlock(value.length ? value : " ", edit.font, wrapWidth);
  const ratio = fontPx / Math.max(1, edit.font);
  let width = edit.shape
    ? Math.max(48, ((edit.shapeBox?.w ?? measured.w) - 12) * scale)
    : wrapWidth != null
      ? Math.max(fontPx, wrapWidth * scale)
      : Math.max(fontPx * 1.2, measured.w * ratio + 12);
  let height = edit.shape
    ? Math.max(fontPx * 1.28, Math.min(measured.h * ratio, (edit.shapeBox?.h ?? measured.h) * scale))
    : Math.max(fontPx * 1.28, measured.h * ratio + 6);
  width = Math.min(width, clipW);
  height = Math.min(height, clipH);
  let left =
    edit.shape && edit.shapeBox
      ? wrapRect.left + (edit.shapeBox.x + edit.shapeBox.w / 2) * scale + cam.x - width / 2
      : wrapRect.left + edit.x * scale + cam.x;
  let top =
    edit.shape && edit.shapeBox
      ? wrapRect.top + (edit.shapeBox.y + edit.shapeBox.h / 2) * scale + cam.y - height / 2
      : wrapRect.top + (edit.y - edit.font) * scale + cam.y;
  left = Math.min(Math.max(left, clipLeft), clipRight - width);
  top = Math.min(Math.max(top, clipTop), clipBottom - height);
  if (!Number.isFinite(left) || !Number.isFinite(top)) {
    left = clipLeft;
    top = clipTop;
  }
  return { left, top, width, height, fontPx, wrapWidth };
}

function CanvasTextEditor({
  edit,
  wrapRef,
  camRef,
  layoutTick,
  onCommit,
  onLive,
}: {
  edit: TextEdit;
  wrapRef: RefObject<HTMLDivElement | null>;
  camRef: RefObject<{ x: number; y: number; scale: number }>;
  layoutTick: number;
  onCommit: (value: string) => void;
  onLive: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(edit.value);
  const committed = useRef(false);
  const wrapEl = wrapRef.current;
  const cam = camRef.current;
  const box =
    wrapEl && cam
      ? textOverlayBox(edit, wrapEl, cam, value)
      : { left: 0, top: 0, width: 160, height: 32, fontPx: 16, wrapWidth: edit.wrapWidth };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    if (edit.strokeId) {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  }, [edit.strokeId]);

  void layoutTick;

  function commitNow(next: string) {
    if (committed.current) return;
    committed.current = true;
    onCommit(next);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <textarea
      ref={ref}
      value={value}
      rows={Math.max(1, (value.match(/\n/g)?.length ?? 0) + 1)}
      aria-label={edit.shape ? "Label inside shape" : "Canvas text"}
      enterKeyHint="done"
      className="m-0 resize-none overflow-hidden border-0 p-0 shadow-none outline-none"
      style={{
        position: "fixed",
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        zIndex: 45,
        fontFamily: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
        fontWeight: 500,
        fontSize: box.fontPx,
        lineHeight: 1.28,
        textAlign: edit.shape ? "center" : "left",
        color: cssDrawColor(edit.color),
        caretColor: cssDrawColor(edit.color),
        background: "transparent",
        appearance: "none",
        WebkitAppearance: "none",
        whiteSpace: box.wrapWidth != null ? "pre-wrap" : "pre",
        wordBreak: "break-word",
      }}
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        onLive(next);
      }}
      onBlur={() => commitNow(value)}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          commitNow(value);
        }
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          commitNow(value);
        }
      }}
    />,
    document.body,
  );
}

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
  const fillRef = useRef<DrawFill>("tint");
  const sizeRef = useRef(2);
  const selectedRef = useRef<string | null>(null);
  const previewRef = useRef<Stroke | null>(null);
  const overrideRef = useRef<Stroke | null>(null);
  const hiddenIdsRef = useRef<Set<string>>(new Set());
  const hideTextIdRef = useRef<string | null>(null);
  const hoverHandleRef = useRef<TransformHandle | null>(null);
  const textEditRef = useRef<TextEdit | null>(null);
  const liveTextRef = useRef("");
  const finishEditRef = useRef<() => void>(() => undefined);
  const undoRef = useRef<Drawing[]>([]);
  const redoRef = useRef<Drawing[]>([]);
  const markDirtyRef = useRef<() => void>(() => undefined);
  const beginEditRef = useRef<(stroke: Stroke) => void>(() => undefined);
  const openTextRef = useRef<(x: number, y: number, wrapWidth?: number) => void>(() => undefined);
  const [tool, setTool] = useState<DrawTool>("select");
  const [color, setColor] = useState<DrawColor>("ink");
  const [fill, setFill] = useState<DrawFill>("tint");
  const [size, setSize] = useState(2);
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [shapesOpen, setShapesOpen] = useState(false);
  const [shapesAnchor, setShapesAnchor] = useState<DOMRect | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  const keepEditRef = useRef<() => void>(() => undefined);
  const undoFnRef = useRef<() => void>(() => undefined);
  const redoFnRef = useRef<() => void>(() => undefined);
  const deleteFnRef = useRef<() => void>(() => undefined);
  const nudgeFnRef = useRef<(dx: number, dy: number) => void>(() => undefined);

  drawingRef.current = drawing;
  toolRef.current = tool;
  colorRef.current = color;
  fillRef.current = fill;
  sizeRef.current = size;

  function syncStacks() {
    setCanUndo(undoRef.current.length > 0);
    setCanRedo(redoRef.current.length > 0);
  }

  function commit(next: Drawing) {
    undoRef.current = [...undoRef.current.slice(-39), drawingRef.current];
    redoRef.current = [];
    drawingRef.current = next;
    updateDrawing(noteId, next);
    syncStacks();
    markDirtyRef.current();
  }

  function undo() {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current = [...redoRef.current, drawingRef.current];
    selectedRef.current = null;
    drawingRef.current = prev;
    updateDrawing(noteId, prev);
    syncStacks();
    markDirtyRef.current();
  }

  function redo() {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current = [...undoRef.current, drawingRef.current];
    selectedRef.current = null;
    drawingRef.current = next;
    updateDrawing(noteId, next);
    syncStacks();
    markDirtyRef.current();
  }

  function beginTextEdit(stroke: Stroke) {
    const cam = camRef.current;
    const box = elementBounds(stroke);
    const shape = isClosedShape(stroke.tool);
    const font = shape ? shapeLabelSize(box.w, box.h) : textFontSize(stroke.size);
    hideTextIdRef.current = stroke.id;
    selectedRef.current = stroke.id;
    const next: TextEdit = {
      strokeId: stroke.id,
      x: stroke.points[0] ?? box.x,
      y: stroke.points[1] ?? box.y + font,
      size: stroke.size,
      color: stroke.color,
      value: stroke.text ?? "",
      shape,
      font,
      wrapWidth: shape ? Math.max(24, box.w - 16) : stroke.textWidth,
      shapeBox: shape ? box : undefined,
      camX: cam.x,
      camY: cam.y,
      camScale: cam.scale,
    };
    textEditRef.current = next;
    liveTextRef.current = next.value;
    setTextEdit(next);
    setShapesOpen(false);
    setShapesAnchor(null);
    markDirtyRef.current();
  }

  function openNewText(x: number, y: number, wrapWidth?: number) {
    const cam = camRef.current;
    const font = textFontSize(sizeRef.current);
    selectedRef.current = null;
    const next: TextEdit = {
      x,
      y,
      size: sizeRef.current,
      color: colorRef.current,
      value: "",
      shape: false,
      font,
      wrapWidth,
      camX: cam.x,
      camY: cam.y,
      camScale: cam.scale,
    };
    textEditRef.current = next;
    liveTextRef.current = "";
    setTextEdit(next);
    setShapesOpen(false);
    setShapesAnchor(null);
    markDirtyRef.current();
  }

  function finishText(value?: string) {
    const edit = textEditRef.current;
    if (!edit) {
      hideTextIdRef.current = null;
      markDirtyRef.current();
      return;
    }
    const trimmed = (value ?? liveTextRef.current).replace(/\s+$/, "");
    textEditRef.current = null;
    liveTextRef.current = "";
    setTextEdit(null);
    hideTextIdRef.current = null;
    if (edit.strokeId) {
      const existing = drawingRef.current.strokes.find((stroke) => stroke.id === edit.strokeId);
      if (existing?.tool === "text" && !trimmed) {
        commit({
          strokes: drawingRef.current.strokes.filter((stroke) => stroke.id !== edit.strokeId),
        });
        selectedRef.current = null;
        return;
      }
      commit({
        strokes: drawingRef.current.strokes.map((stroke) =>
          stroke.id === edit.strokeId ? { ...stroke, text: trimmed || undefined } : stroke,
        ),
      });
      selectedRef.current = edit.strokeId;
      return;
    }
    if (!trimmed) {
      markDirtyRef.current();
      return;
    }
    const created: Stroke = {
      id: newStrokeId(),
      tool: "text",
      color: edit.color,
      size: edit.size,
      points: [edit.x, edit.y],
      text: trimmed,
      textWidth: edit.wrapWidth,
    };
    commit({
      strokes: [...drawingRef.current.strokes, created],
    });
    selectedRef.current = created.id;
  }

  beginEditRef.current = beginTextEdit;
  openTextRef.current = openNewText;
  finishEditRef.current = () => finishText();
  undoFnRef.current = undo;
  redoFnRef.current = redo;
  deleteFnRef.current = () => {
    const id = selectedRef.current;
    if (!id) return;
    commit({ strokes: drawingRef.current.strokes.filter((stroke) => stroke.id !== id) });
    selectedRef.current = null;
  };
  nudgeFnRef.current = (dx, dy) => {
    const id = selectedRef.current;
    if (!id) return;
    commit({
      strokes: drawingRef.current.strokes.map((stroke) =>
        stroke.id === id ? nudgeStroke(stroke, dx, dy) : stroke,
      ),
    });
  };

  function keepEditVisible() {
    const edit = textEditRef.current;
    const wrap = wrapRef.current;
    if (!edit || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const view = viewRect();
    const clipTop = Math.max(rect.top, view.top) + 24;
    const clipBottom = Math.min(rect.bottom, view.bottom) - 24;
    const clipLeft = Math.max(rect.left, view.left) + 24;
    const clipRight = Math.min(rect.right, view.right) - 24;
    if (clipBottom - clipTop < 40 || clipRight - clipLeft < 40) {
      setLayoutTick((tick) => tick + 1);
      return;
    }
    const cam = camRef.current;
    const worldX = edit.shape && edit.shapeBox ? edit.shapeBox.x + edit.shapeBox.w / 2 : edit.x;
    const worldY = edit.shape && edit.shapeBox ? edit.shapeBox.y + edit.shapeBox.h / 2 : edit.y;
    const screenX = worldX * cam.scale + cam.x + rect.left;
    const screenY = worldY * cam.scale + cam.y + rect.top;
    const slackX = Math.min(64, (clipRight - clipLeft) * 0.25);
    const slackY = Math.min(56, (clipBottom - clipTop) * 0.22);
    let dx = 0;
    let dy = 0;
    if (screenX < clipLeft + slackX || screenX > clipRight - slackX) {
      dx = (clipLeft + clipRight) / 2 - screenX;
    }
    if (screenY < clipTop + slackY || screenY > clipBottom - slackY) {
      dy = clipTop + (clipBottom - clipTop) * 0.38 - screenY;
    }
    if (dx || dy) {
      cam.x += dx;
      cam.y += dy;
      markDirtyRef.current();
    }
    window.scrollTo(0, 0);
    setLayoutTick((tick) => tick + 1);
  }

  keepEditRef.current = keepEditVisible;

  useEffect(() => {
    if (!textEdit) return;
    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    html.style.overflow = "hidden";
    const bump = () => keepEditRef.current();
    bump();
    const frame = requestAnimationFrame(bump);
    const later = window.setTimeout(bump, 280);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", bump);
    viewport?.addEventListener("scroll", bump);
    window.addEventListener("resize", bump);
    return () => {
      html.style.overflow = previousOverflow;
      cancelAnimationFrame(frame);
      window.clearTimeout(later);
      viewport?.removeEventListener("resize", bump);
      viewport?.removeEventListener("scroll", bump);
      window.removeEventListener("resize", bump);
    };
  }, [textEdit]);

  useEffect(() => {
    if (!shapesOpen) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-shapes-picker]")) return;
      setShapesOpen(false);
      setShapesAnchor(null);
    }
    function onDismiss() {
      setShapesOpen(false);
      setShapesAnchor(null);
    }
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", onDismiss);
    window.addEventListener("scroll", onDismiss, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("resize", onDismiss);
      window.removeEventListener("scroll", onDismiss, true);
    };
  }, [shapesOpen]);

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
      if (event.key === "Enter" && selectedRef.current) {
        const selected = drawingRef.current.strokes.find((stroke) => stroke.id === selectedRef.current);
        if (selected && (isClosedShape(selected.tool) || selected.tool === "text")) {
          event.preventDefault();
          beginEditRef.current(selected);
          return;
        }
      }
      if (event.key === "Escape") {
        if (textEditRef.current) {
          event.preventDefault();
          finishEditRef.current();
          return;
        }
        selectedRef.current = null;
        hideTextIdRef.current = null;
        setShapesOpen(false);
        setShapesAnchor(null);
        markDirtyRef.current();
        return;
      }
      if (!meta && selectedRef.current && event.key.startsWith("Arrow")) {
        event.preventDefault();
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
        const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
        nudgeFnRef.current(dx, dy);
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
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
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

    function selectedStroke(): Stroke | undefined {
      const id = selectedRef.current;
      if (!id) return undefined;
      const override = overrideRef.current;
      if (override && override.id === id) return override;
      return drawingRef.current.strokes.find((stroke) => stroke.id === id);
    }

    function worldFromEvent(event: PointerEvent | MouseEvent | WheelEvent) {
      const rect = surface.getBoundingClientRect();
      return world(event.clientX - rect.left, event.clientY - rect.top);
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
      const override = overrideRef.current;
      const hideText = hideTextIdRef.current;
      for (const stroke of drawingRef.current.strokes) {
        if (hidden.has(stroke.id)) continue;
        const drawn = override && stroke.id === override.id ? override : stroke;
        paintStroke(context, drawn, ink, { hideText: hideText === stroke.id });
      }
      if (previewRef.current) paintStroke(context, previewRef.current, ink);
      const selected = selectedStroke();
      if (selected) {
        paintSelection(context, selected, ink, cam.scale, hoverHandleRef.current);
      }
      context.restore();
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);

    type Drag =
      | { kind: "pan"; lx: number; ly: number }
      | { kind: "draw"; stroke: Stroke }
      | { kind: "shape"; startX: number; startY: number; cx: number; cy: number; tool: StrokeTool }
      | { kind: "text-box"; startX: number; startY: number; cx: number; cy: number }
      | { kind: "erase"; ids: Set<string> }
      | { kind: "move"; id: string; x: number; y: number; moved: boolean; wasSelected: boolean }
      | { kind: "resize"; id: string; handle: TransformHandle; origin: Stroke; box: Bounds }
      | { kind: "pinch"; dist: number; scale: number; mx: number; my: number; camX: number; camY: number }
      | { kind: "ignore" };

    let drag: Drag | null = null;
    const pointers = new Map<number, { x: number; y: number }>();

    function pinchInfo() {
      const pts = [...pointers.values()];
      if (pts.length < 2) return null;
      const a = pts[0]!;
      const b = pts[1]!;
      return {
        dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
      };
    }

    function applyPinch(
      info: { dist: number; cx: number; cy: number },
      origin: Extract<Drag, { kind: "pinch" }>,
    ) {
      const rect = surface.getBoundingClientRect();
      const ox = origin.mx - rect.left;
      const oy = origin.my - rect.top;
      const worldX = (ox - origin.camX) / origin.scale;
      const worldY = (oy - origin.camY) / origin.scale;
      const next = Math.min(6, Math.max(0.2, origin.scale * (info.dist / origin.dist)));
      const nx = info.cx - rect.left;
      const ny = info.cy - rect.top;
      camRef.current.scale = next;
      camRef.current.x = nx - worldX * next;
      camRef.current.y = ny - worldY * next;
      markDirty();
    }

    function setCursor(value: string) {
      surface.style.cursor = value;
    }

    function hoverAt(event: PointerEvent) {
      const currentTool = toolRef.current;
      if (drag) return;
      if (currentTool === "hand" || spaceRef.current) {
        setCursor("grab");
        return;
      }
      const w = worldFromEvent(event);
      const selected = selectedStroke();
      if (selected) {
        const handle = hitHandle(
          selected,
          elementBounds(selected),
          w.x,
          w.y,
          handleWorldSize(event.pointerType, camRef.current.scale),
        );
        if (handle !== hoverHandleRef.current) {
          hoverHandleRef.current = handle;
          markDirty();
        }
        if (handle) {
          setCursor(handleCursor(handle));
          return;
        }
        if (currentTool === "select" && strokeHits(selected, w.x, w.y, 8)) {
          setCursor("move");
          return;
        }
      } else if (hoverHandleRef.current) {
        hoverHandleRef.current = null;
        markDirty();
      }
      if (currentTool === "text") setCursor("text");
      else if (currentTool === "select") {
        const hit = hitTopStroke(drawingRef.current.strokes, w.x, w.y);
        setCursor(hit ? "move" : "default");
      } else if (currentTool === "eraser") setCursor("cell");
      else setCursor("crosshair");
    }

    function onPointerDown(event: PointerEvent) {
      if (event.button === 2) return;
      event.preventDefault();
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      try {
        surface.setPointerCapture(event.pointerId);
      } catch {
        /* already captured */
      }

      if (textEditRef.current) {
        finishEditRef.current();
        drag = { kind: "ignore" };
        return;
      }

      if (pointers.size >= 2) {
        const info = pinchInfo();
        previewRef.current = null;
        overrideRef.current = null;
        drag = info
          ? {
              kind: "pinch",
              dist: info.dist,
              scale: camRef.current.scale,
              mx: info.cx,
              my: info.cy,
              camX: camRef.current.x,
              camY: camRef.current.y,
            }
          : { kind: "ignore" };
        return;
      }

      const w = worldFromEvent(event);
      const currentTool = toolRef.current;
      const pan = currentTool === "hand" || spaceRef.current || event.button === 1;
      if (pan) {
        drag = { kind: "pan", lx: event.clientX, ly: event.clientY };
        setCursor("grabbing");
        return;
      }

      const canTransform =
        currentTool === "select" ||
        currentTool === "text" ||
        isTwoPointTool(currentTool as StrokeTool);

      const selected = selectedStroke();
      if (selected && canTransform) {
        const handle = hitHandle(
          selected,
          elementBounds(selected),
          w.x,
          w.y,
          handleWorldSize(event.pointerType, camRef.current.scale),
        );
        if (handle) {
          drag = {
            kind: "resize",
            id: selected.id,
            handle,
            origin: selected,
            box: elementBounds(selected),
          };
          setCursor(handleCursor(handle));
          return;
        }
        if (strokeHits(selected, w.x, w.y, 8)) {
          drag = { kind: "move", id: selected.id, x: w.x, y: w.y, moved: false, wasSelected: true };
          setCursor("move");
          return;
        }
      }

      if (currentTool === "select") {
        const hit = hitTopStroke(drawingRef.current.strokes, w.x, w.y);
        selectedRef.current = hit?.id ?? null;
        if (hit) {
          drag = { kind: "move", id: hit.id, x: w.x, y: w.y, moved: false, wasSelected: false };
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
        const hit = hitTopStroke(drawingRef.current.strokes, w.x, w.y);
        if (hit && (isClosedShape(hit.tool) || hit.tool === "text")) {
          beginEditRef.current(hit);
          drag = { kind: "ignore" };
          return;
        }
        drag = { kind: "text-box", startX: w.x, startY: w.y, cx: event.clientX, cy: event.clientY };
        return;
      }
      if (SHAPE_TOOLS.includes(currentTool as StrokeTool)) {
        drag = {
          kind: "shape",
          startX: w.x,
          startY: w.y,
          cx: event.clientX,
          cy: event.clientY,
          tool: currentTool as StrokeTool,
        };
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

    function appendDrawPoint(stroke: Stroke, x: number, y: number) {
      const pts = stroke.points;
      const lastX = pts[pts.length - 2] ?? x;
      const lastY = pts[pts.length - 1] ?? y;
      if (Math.hypot(x - lastX, y - lastY) < 0.45) return false;
      stroke.points.push(x, y);
      return true;
    }

    function onPointerMove(event: PointerEvent) {
      if (pointers.has(event.pointerId)) {
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }
      if (!drag || drag.kind === "ignore") {
        if (!drag) hoverAt(event);
        return;
      }
      if (drag.kind === "pinch") {
        const info = pinchInfo();
        if (info) applyPinch(info, drag);
        return;
      }
      const w = worldFromEvent(event);
      if (drag.kind === "pan") {
        camRef.current.x += event.clientX - drag.lx;
        camRef.current.y += event.clientY - drag.ly;
        drag.lx = event.clientX;
        drag.ly = event.clientY;
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
        const movedId = drag.id;
        const source = drawingRef.current.strokes.find((stroke) => stroke.id === movedId);
        if (source) overrideRef.current = translateStroke(source, dx, dy);
        markDirty();
        return;
      }
      if (drag.kind === "resize") {
        overrideRef.current = resizeStroke(drag.origin, drag.box, drag.handle, w.x, w.y, event.shiftKey);
        markDirty();
        return;
      }
      if (drag.kind === "draw") {
        const coalesced = event.getCoalescedEvents?.().length ? event.getCoalescedEvents() : [event];
        let changed = false;
        for (const point of coalesced) {
          const pw = worldFromEvent(point);
          if (appendDrawPoint(drag.stroke, pw.x, pw.y)) changed = true;
        }
        if (!changed) return;
        previewRef.current = drag.stroke;
        markDirty();
        return;
      }
      if (drag.kind === "text-box") {
        const x1 = drag.startX;
        const y1 = drag.startY;
        if (Math.hypot(w.x - x1, w.y - y1) < 8) {
          previewRef.current = null;
          markDirty();
          return;
        }
        previewRef.current = {
          id: "preview",
          tool: "rect",
          color: colorRef.current,
          size: 1,
          points: [x1, y1, w.x, w.y],
          fill: "none",
        };
        markDirty();
        return;
      }
      const end = constrainEnd(drag.tool, drag.startX, drag.startY, w.x, w.y, event.shiftKey);
      previewRef.current = {
        id: "preview",
        tool: drag.tool,
        color: colorRef.current,
        size: sizeRef.current,
        points: [drag.startX, drag.startY, end.x, end.y],
        fill: isClosedShape(drag.tool) ? fillRef.current : undefined,
      };
      markDirty();
    }

    function onPointerUp(event: PointerEvent) {
      pointers.delete(event.pointerId);
      if (!drag) return;
      const w = worldFromEvent(event);
      if (drag.kind === "ignore") {
        /* click-away from text */
      } else if (drag.kind === "pinch") {
        if (pointers.size >= 2) {
          const info = pinchInfo();
          if (info) {
            drag = {
              kind: "pinch",
              dist: info.dist,
              scale: camRef.current.scale,
              mx: info.cx,
              my: info.cy,
              camX: camRef.current.x,
              camY: camRef.current.y,
            };
            return;
          }
        }
      } else if (drag.kind === "draw") {
        commit({ strokes: [...drawingRef.current.strokes, drag.stroke] });
        selectedRef.current = drag.stroke.id;
      } else if (drag.kind === "shape") {
        const screenDist = Math.hypot(event.clientX - drag.cx, event.clientY - drag.cy);
        if (screenDist >= CREATE_DRAG_PX) {
          const end = constrainEnd(drag.tool, drag.startX, drag.startY, w.x, w.y, event.shiftKey);
          if (Math.hypot(end.x - drag.startX, end.y - drag.startY) > 3) {
            const created: Stroke = {
              id: newStrokeId(),
              tool: drag.tool,
              color: colorRef.current,
              size: sizeRef.current,
              points: [drag.startX, drag.startY, end.x, end.y],
              fill: isClosedShape(drag.tool) ? fillRef.current : undefined,
            };
            commit({ strokes: [...drawingRef.current.strokes, created] });
            selectedRef.current = created.id;
          } else {
            selectedRef.current = null;
          }
        } else {
          selectedRef.current = null;
        }
      } else if (drag.kind === "text-box") {
        const dx = w.x - drag.startX;
        const screenDist = Math.hypot(event.clientX - drag.cx, event.clientY - drag.cy);
        if (screenDist > CREATE_DRAG_PX) {
          const boxX = Math.min(drag.startX, w.x);
          const boxY = Math.min(drag.startY, w.y);
          openTextRef.current(boxX, boxY + textFontSize(sizeRef.current), Math.max(40, Math.abs(dx)));
        } else {
          openTextRef.current(drag.startX, drag.startY);
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
        selectedRef.current = movedId;
      } else if (drag.kind === "move" && drag.wasSelected) {
        const editId = drag.id;
        const stroke = drawingRef.current.strokes.find((item) => item.id === editId);
        if (stroke && (stroke.tool === "text" || isClosedShape(stroke.tool))) {
          beginEditRef.current(stroke);
        }
      } else if (drag.kind === "resize") {
        const next = overrideRef.current;
        if (next) {
          commit({
            strokes: drawingRef.current.strokes.map((stroke) => (stroke.id === next.id ? next : stroke)),
          });
          selectedRef.current = next.id;
        }
      }
      previewRef.current = null;
      hiddenIdsRef.current = new Set();
      overrideRef.current = null;
      drag = null;
      markDirty();
    }

    function onDblClick(event: MouseEvent) {
      const w = worldFromEvent(event);
      const hit = hitTopStroke(drawingRef.current.strokes, w.x, w.y);
      if (hit && (isClosedShape(hit.tool) || hit.tool === "text")) {
        event.preventDefault();
        beginEditRef.current(hit);
        return;
      }
      if (!hit) {
        event.preventDefault();
        openTextRef.current(w.x, w.y);
      }
    }

    function onWheel(event: WheelEvent) {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.92 : 1.08;
      const next = Math.min(6, Math.max(0.2, camRef.current.scale * factor));
      const rect = surface.getBoundingClientRect();
      const ox = event.clientX - rect.left;
      const oy = event.clientY - rect.top;
      const w = world(ox, oy);
      camRef.current.scale = next;
      camRef.current.x = ox - w.x * next;
      camRef.current.y = oy - w.y * next;
      markDirty();
    }

    surface.addEventListener("pointerdown", onPointerDown);
    surface.addEventListener("pointermove", onPointerMove);
    surface.addEventListener("pointerup", onPointerUp);
    surface.addEventListener("pointercancel", onPointerUp);
    surface.addEventListener("dblclick", onDblClick);
    surface.addEventListener("wheel", onWheel, { passive: false });
    markDirty();
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      ro.disconnect();
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", onPointerUp);
      surface.removeEventListener("pointercancel", onPointerUp);
      surface.removeEventListener("dblclick", onDblClick);
      surface.removeEventListener("wheel", onWheel);
    };
  }, [noteId, updateDrawing]);

  useEffect(() => {
    undoRef.current = [];
    redoRef.current = [];
    selectedRef.current = null;
    hideTextIdRef.current = null;
    textEditRef.current = null;
    setTextEdit(null);
    setCanUndo(false);
    setCanRedo(false);
    markDirtyRef.current();
  }, [noteId]);

  useEffect(() => {
    markDirtyRef.current();
  }, [drawing, tool]);

  const fileTitle = displayTitle(title ?? "");
  const extraActive = EXTRA_SHAPES.some((item) => item.id === tool);
  const cursor =
    tool === "hand" ? "grab" : tool === "text" ? "text" : tool === "select" ? "default" : "crosshair";

  function pickShape(id: DrawTool) {
    setTool(id);
    setShapesOpen(false);
    setShapesAnchor(null);
  }

  function toggleShapes(el: HTMLElement) {
    if (shapesOpen) {
      setShapesOpen(false);
      setShapesAnchor(null);
      return;
    }
    setShapesAnchor(el.getBoundingClientRect());
    setShapesOpen(true);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto overscroll-x-contain scroll-thin border-b border-paper-line px-2 py-1.5 lg:gap-1 lg:px-3 lg:py-2">
        <div className="hidden items-center gap-0.5 lg:flex">
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
                    "inline-flex size-9 shrink-0 items-center justify-center rounded-sm text-paper-muted",
                    tool === item.id ? "bg-paper-hover text-paper-fg" : "hover:text-paper-fg",
                  )}
                >
                  <Icon className="size-4" />
                </button>
              </Hint>
            );
          })}
          <ShapesButton
            extraActive={extraActive}
            tool={tool}
            open={shapesOpen}
            onToggle={toggleShapes}
          />
          <span className="mx-1 h-5 w-px shrink-0 bg-paper-line" />
        </div>
        {DRAW_COLORS.map((item) => (
          <button
            key={item}
            type="button"
            aria-label={item}
            aria-pressed={color === item}
            onClick={() => setColor(item)}
            className={cn(
              "size-7 shrink-0 rounded-full border border-paper-line",
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
        <span className="mx-1 h-5 w-px shrink-0 bg-paper-line" />
        {DRAW_FILLS.map((item) => (
          <Hint key={item.id} label={item.label}>
            <button
              type="button"
              aria-label={item.label}
              aria-pressed={fill === item.id}
              onClick={() => setFill(item.id)}
              className={cn(
                "inline-flex size-10 shrink-0 items-center justify-center rounded-sm text-paper-muted lg:size-9",
                fill === item.id ? "bg-paper-hover text-paper-fg" : "hover:text-paper-fg",
              )}
            >
              <span
                className="size-3.5 rounded-[2px] border border-current"
                style={{
                  background:
                    item.id === "none"
                      ? "transparent"
                      : item.id === "solid"
                        ? "currentColor"
                        : "color-mix(in oklab, currentColor 35%, transparent)",
                }}
              />
            </button>
          </Hint>
        ))}
        <span className="mx-1 h-5 w-px shrink-0 bg-paper-line" />
        {SIZES.map((item) => (
          <button
            key={item}
            type="button"
            aria-label={`Size ${item}`}
            onClick={() => setSize(item)}
            className={cn(
              "inline-flex size-10 shrink-0 items-center justify-center rounded-sm text-paper-muted lg:size-9",
              size === item ? "bg-paper-hover text-paper-fg" : "hover:text-paper-fg",
            )}
          >
            <span className="rounded-full bg-current" style={{ width: item + 4, height: item + 4 }} />
          </button>
        ))}
        <span className="ml-auto flex shrink-0 items-center gap-0.5 pl-2">
          <Hint label="Undo">
            <Button
              variant="quiet"
              size="icon-sm"
              className="size-10 text-paper-muted hover:bg-paper-hover hover:text-paper-fg lg:size-8"
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
              className="size-10 text-paper-muted hover:bg-paper-hover hover:text-paper-fg lg:size-8"
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
            className="hidden h-9 px-2 text-paper-muted hover:bg-paper-hover hover:text-paper-fg lg:inline-flex"
            onClick={() => void exportDrawingImage(drawingRef.current, fileTitle, "png")}
          >
            PNG
          </Button>
          <Button
            variant="quiet"
            size="sm"
            className="hidden h-9 px-2 text-paper-muted hover:bg-paper-hover hover:text-paper-fg lg:inline-flex"
            onClick={() => void exportDrawingImage(drawingRef.current, fileTitle, "jpeg")}
          >
            JPEG
          </Button>
          <Hint label="Clear canvas">
            <Button
              variant="quiet"
              size="icon-sm"
              className="size-10 text-paper-muted hover:bg-paper-hover hover:text-paper-fg lg:size-8"
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
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden overscroll-none">
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none select-none"
          style={{ cursor, touchAction: "none" }}
          aria-label="Infinite drawing canvas"
        />
        {textEdit ? (
          <CanvasTextEditor
            key={textEdit.strokeId ?? "new"}
            edit={textEdit}
            wrapRef={wrapRef}
            camRef={camRef}
            layoutTick={layoutTick}
            onCommit={finishText}
            onLive={(value) => {
              liveTextRef.current = value;
            }}
          />
        ) : null}
        <p className="pointer-events-none absolute bottom-3 left-4 hidden max-w-[70%] text-xs text-paper-subtle lg:block">
          Drag to draw a shape · tap a selected shape to label it · pinch to zoom
        </p>
      </div>
      {textEdit ? null : (
      <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto overscroll-x-contain scroll-thin border-t border-paper-line px-2 py-1.5 pb-[max(0.4rem,env(safe-area-inset-bottom))] lg:hidden">
        {TOOLS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              aria-pressed={tool === item.id}
              onClick={() => setTool(item.id)}
              className={cn(
                "inline-flex size-11 shrink-0 items-center justify-center rounded-md text-paper-muted",
                tool === item.id ? "bg-paper-hover text-paper-fg" : "hover:text-paper-fg",
              )}
            >
              <Icon className="size-5" />
            </button>
          );
        })}
        <ShapesButton extraActive={extraActive} tool={tool} open={shapesOpen} onToggle={toggleShapes} />
      </div>
      )}
      <ShapesMenu open={shapesOpen} anchor={shapesAnchor} tool={tool} onPick={pickShape} />
    </div>
  );
}
