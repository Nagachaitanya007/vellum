import { downloadBlob, safeSegment } from "./export";
import type { DrawColor, Drawing, Stroke, StrokeTool } from "./types";

const STROKE_TOOLS: StrokeTool[] = [
  "pen",
  "highlighter",
  "line",
  "rect",
  "ellipse",
  "diamond",
  "arrow",
  "text",
];

export function emptyDrawing(): Drawing {
  return { strokes: [] };
}

export function newStrokeId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `stroke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeDrawing(raw: Partial<Drawing> | undefined): Drawing {
  if (!raw || !Array.isArray(raw.strokes)) return emptyDrawing();
  return {
    strokes: raw.strokes.filter((stroke): stroke is Stroke => {
      if (!stroke || !Array.isArray(stroke.points) || stroke.points.length < 2) return false;
      return STROKE_TOOLS.includes(stroke.tool as StrokeTool);
    }),
  };
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
}

export function textFontSize(size: number): number {
  return Math.max(16, size * 8);
}

export function strokeHits(stroke: Stroke, x: number, y: number, radius: number): boolean {
  if (stroke.tool === "text") {
    const tx = stroke.points[0] ?? 0;
    const ty = stroke.points[1] ?? 0;
    const font = textFontSize(stroke.size);
    const w = Math.max(40, (stroke.text?.length ?? 1) * font * 0.55);
    const h = font * 1.3;
    return x >= tx - 4 && x <= tx + w && y >= ty - h && y <= ty + 8;
  }
  const bounds = strokeBounds(stroke);
  if (
    x >= bounds.x - radius &&
    x <= bounds.x + bounds.w + radius &&
    y >= bounds.y - radius &&
    y <= bounds.y + bounds.h + radius
  ) {
    if (stroke.tool === "rect" || stroke.tool === "ellipse" || stroke.tool === "diamond") {
      return true;
    }
  }
  const pts = stroke.points;
  for (let i = 0; i < pts.length; i += 2) {
    const px = pts[i];
    const py = pts[i + 1];
    if (px === undefined || py === undefined) continue;
    if (distance(px, py, x, y) <= radius) return true;
  }
  for (let i = 0; i < pts.length - 2; i += 2) {
    const x1 = pts[i];
    const y1 = pts[i + 1];
    const x2 = pts[i + 2];
    const y2 = pts[i + 3];
    if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) continue;
    if (pointToSegment(x, y, x1, y1, x2, y2) <= radius) return true;
  }
  return false;
}

export function hitTopStroke(strokes: Stroke[], x: number, y: number, radius = 10): Stroke | undefined {
  for (let i = strokes.length - 1; i >= 0; i -= 1) {
    const stroke = strokes[i];
    if (!stroke) continue;
    if (strokeHits(stroke, x, y, radius + stroke.size)) return stroke;
  }
  return undefined;
}

export function strokeBounds(stroke: Stroke): { x: number; y: number; w: number; h: number } {
  if (stroke.tool === "text") {
    const x = stroke.points[0] ?? 0;
    const y = stroke.points[1] ?? 0;
    const font = textFontSize(stroke.size);
    const w = Math.max(40, (stroke.text?.length ?? 1) * font * 0.55);
    const h = font * 1.3;
    return { x, y: y - h, w, h };
  }
  const pts = stroke.points;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i] ?? 0;
    const y = pts[i + 1] ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  const pad = stroke.size / 2;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

export function drawingBounds(drawing: Drawing): { x: number; y: number; w: number; h: number } | null {
  if (drawing.strokes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of drawing.strokes) {
    const box = strokeBounds(stroke);
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function translateStroke(stroke: Stroke, dx: number, dy: number): Stroke {
  const points = stroke.points.map((value, index) => value + (index % 2 === 0 ? dx : dy));
  return { ...stroke, points };
}

export function constrainEnd(
  tool: StrokeTool,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  shift: boolean,
): { x: number; y: number } {
  if (!shift) return { x: x2, y: y2 };
  if (tool === "line" || tool === "arrow") {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);
    const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    const len = Math.hypot(dx, dy);
    return { x: x1 + Math.cos(snap) * len, y: y1 + Math.sin(snap) * len };
  }
  if (tool === "rect" || tool === "ellipse" || tool === "diamond") {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: x1 + Math.sign(dx || 1) * side, y: y1 + Math.sign(dy || 1) * side };
  }
  return { x: x2, y: y2 };
}

function pointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  if (len === 0) return distance(px, py, x1, y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return distance(px, py, x1 + t * dx, y1 + t * dy);
}

export const DRAW_COLORS: DrawColor[] = ["ink", "red", "blue", "green", "highlight"];

export function resolveDrawColor(color: DrawColor, ink: string): string {
  if (typeof document === "undefined") {
    switch (color) {
      case "red":
        return "#c45c4a";
      case "blue":
        return "#3d6a8c";
      case "green":
        return "#4a7c59";
      case "highlight":
        return "#c4a35a";
      default:
        return ink;
    }
  }
  switch (color) {
    case "red":
      return getComputedStyle(document.documentElement).getPropertyValue("--color-draw-red").trim() || "#c45c4a";
    case "blue":
      return getComputedStyle(document.documentElement).getPropertyValue("--color-draw-blue").trim() || "#3d6a8c";
    case "green":
      return getComputedStyle(document.documentElement).getPropertyValue("--color-draw-green").trim() || "#4a7c59";
    case "highlight":
      return getComputedStyle(document.documentElement).getPropertyValue("--color-draw-highlight").trim() || "#c4a35a";
    default:
      return ink;
  }
}

export function paintGrid(
  ctx: CanvasRenderingContext2D,
  rect: { width: number; height: number },
  cam: { x: number; y: number; scale: number },
  line: string,
) {
  const step = 48;
  const left = -cam.x / cam.scale;
  const top = -cam.y / cam.scale;
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

export function paintStroke(ctx: CanvasRenderingContext2D, stroke: Stroke, ink: string) {
  const pts = stroke.points;
  if (pts.length < 2) return;
  const color = resolveDrawColor(stroke.color, ink);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = stroke.tool === "highlighter" ? 0.35 : 1;
  ctx.lineWidth = stroke.size;

  if (stroke.tool === "text") {
    ctx.globalAlpha = 1;
    ctx.font = `${textFontSize(stroke.size)}px "Newsreader", "Iowan Old Style", Palatino, serif`;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(stroke.text ?? "", pts[0] ?? 0, pts[1] ?? 0);
    return;
  }

  if (stroke.tool === "rect" || stroke.tool === "ellipse" || stroke.tool === "diamond") {
    const x1 = pts[0] ?? 0;
    const y1 = pts[1] ?? 0;
    const x2 = pts[2] ?? x1;
    const y2 = pts[3] ?? y1;
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    ctx.beginPath();
    if (stroke.tool === "rect") {
      ctx.rect(left, top, w, h);
    } else if (stroke.tool === "ellipse") {
      ctx.ellipse(left + w / 2, top + h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
    } else {
      ctx.moveTo(left + w / 2, top);
      ctx.lineTo(left + w, top + h / 2);
      ctx.lineTo(left + w / 2, top + h);
      ctx.lineTo(left, top + h / 2);
      ctx.closePath();
    }
    ctx.globalAlpha = 0.12;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
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

export function paintSelection(ctx: CanvasRenderingContext2D, stroke: Stroke, ink: string) {
  const box = strokeBounds(stroke);
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1;
  ctx.strokeRect(box.x - 4, box.y - 4, box.w + 8, box.h + 8);
  ctx.restore();
}

export async function exportDrawingImage(
  drawing: Drawing,
  title: string,
  format: "png" | "jpeg",
) {
  const box = drawingBounds(drawing);
  const pad = 48;
  const w = Math.max(320, Math.ceil((box?.w ?? 240) + pad * 2));
  const h = Math.max(240, Math.ceil((box?.h ?? 180) + pad * 2));
  const max = 4096;
  const scale = Math.min(2, max / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(w * scale));
  canvas.height = Math.max(1, Math.floor(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(scale, scale);
  const paper =
    getComputedStyle(document.documentElement).getPropertyValue("--color-paper").trim() || "#1a1916";
  const ink =
    getComputedStyle(document.documentElement).getPropertyValue("--color-paper-fg").trim() || "#f4f1ea";
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, w, h);
  ctx.translate(box ? pad - box.x : pad, box ? pad - box.y : pad);
  for (const stroke of drawing.strokes) paintStroke(ctx, stroke, ink);
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.92));
  if (!blob) return;
  downloadBlob(blob, `${safeSegment(title)}.${format === "png" ? "png" : "jpg"}`);
}
