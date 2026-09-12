import type { DrawColor, Drawing, Stroke } from "./types";

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
    strokes: raw.strokes.filter(
      (stroke): stroke is Stroke =>
        Boolean(stroke) &&
        Array.isArray(stroke.points) &&
        stroke.points.length >= 2 &&
        typeof stroke.tool === "string",
    ),
  };
}

export function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
}

export function strokeHits(stroke: Stroke, x: number, y: number, radius: number): boolean {
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
