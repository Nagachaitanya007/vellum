import type { Stroke, StrokeTool } from "./types";

export type Bounds = { x: number; y: number; w: number; h: number };

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type VertexHandle = "start" | "end";
export type TransformHandle = ResizeHandle | VertexHandle;

export const BOX_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const MIN_SIZE = 12;

export function isClosedShape(tool: StrokeTool): boolean {
  return (
    tool === "rect" ||
    tool === "ellipse" ||
    tool === "diamond" ||
    tool === "triangle" ||
    tool === "pentagon" ||
    tool === "hexagon" ||
    tool === "star"
  );
}

export function isLineTool(tool: StrokeTool): boolean {
  return tool === "line" || tool === "arrow";
}

export function isTwoPointTool(tool: StrokeTool): boolean {
  return isClosedShape(tool) || isLineTool(tool);
}

export function textFontSize(size: number): number {
  return Math.max(10, size * 8);
}

export function labelFont(px: number): string {
  return `500 ${Math.round(px)}px "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif`;
}

export function pointsBounds(points: number[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i] ?? 0;
    const y = points[i + 1] ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

let measureCtx: CanvasRenderingContext2D | null | undefined;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx !== undefined) return measureCtx;
  if (typeof document === "undefined") {
    measureCtx = null;
    return null;
  }
  const canvas = document.createElement("canvas");
  measureCtx = canvas.getContext("2d");
  return measureCtx;
}

export function measureLineWidth(text: string, fontSize: number): number {
  const ctx = getMeasureCtx();
  if (ctx) {
    ctx.font = labelFont(fontSize);
    return ctx.measureText(text.length ? text : " ").width;
  }
  return Math.max(1, (text.length || 1) * fontSize * 0.56);
}

export function wrapTextToWidth(text: string, fontSize: number, maxWidth: number): string[] {
  const paragraphs = text.split("\n");
  const out: string[] = [];
  const width = Math.max(8, maxWidth);
  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      out.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && measureLineWidth(next, fontSize) > width) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out.length > 0 ? out : [""];
}

export function measureTextBlock(
  text: string,
  fontSize: number,
  wrapWidth?: number,
): { w: number; h: number; lines: string[] } {
  const lineH = fontSize * 1.28;
  const lines = wrapWidth != null ? wrapTextToWidth(text, fontSize, wrapWidth) : text.length ? text.split("\n") : [""];
  let maxW = 0;
  for (const line of lines) {
    maxW = Math.max(maxW, measureLineWidth(line, fontSize));
  }
  const w = wrapWidth != null ? Math.max(fontSize * 0.75, wrapWidth) : Math.max(fontSize * 0.75, maxW + 4);
  const h = Math.max(lineH, lines.length * lineH);
  return { w, h, lines };
}

export function polygonVertices(
  tool: StrokeTool,
  left: number,
  top: number,
  w: number,
  h: number,
): { x: number; y: number }[] {
  const cx = left + w / 2;
  const cy = top + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  if (tool === "diamond") {
    return [
      { x: cx, y: top },
      { x: left + w, y: cy },
      { x: cx, y: top + h },
      { x: left, y: cy },
    ];
  }
  if (tool === "triangle") {
    return [
      { x: cx, y: top },
      { x: left + w, y: top + h },
      { x: left, y: top + h },
    ];
  }
  if (tool === "pentagon" || tool === "hexagon") {
    const n = tool === "pentagon" ? 5 : 6;
    const pts: { x: number; y: number }[] = [];
    const offset = tool === "hexagon" ? Math.PI / 6 : -Math.PI / 2;
    for (let i = 0; i < n; i += 1) {
      const a = offset + (i * Math.PI * 2) / n;
      pts.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
    }
    return pts;
  }
  if (tool === "star") {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 10; i += 1) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 1 : 0.4;
      pts.push({ x: cx + rx * r * Math.cos(a), y: cy + ry * r * Math.sin(a) });
    }
    return pts;
  }
  return [];
}

export function traceClosedShape(
  ctx: CanvasRenderingContext2D,
  tool: StrokeTool,
  left: number,
  top: number,
  w: number,
  h: number,
) {
  ctx.beginPath();
  if (tool === "rect") {
    ctx.rect(left, top, w, h);
    return;
  }
  if (tool === "ellipse") {
    ctx.ellipse(left + w / 2, top + h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
    return;
  }
  const pts = polygonVertices(tool, left, top, w, h);
  if (pts.length === 0) {
    ctx.rect(left, top, w, h);
    return;
  }
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i += 1) {
    ctx.lineTo(pts[i]!.x, pts[i]!.y);
  }
  ctx.closePath();
}

export function handleCenters(stroke: Stroke, box: Bounds): { id: TransformHandle; x: number; y: number }[] {
  if (isLineTool(stroke.tool)) {
    return [
      { id: "start", x: stroke.points[0] ?? 0, y: stroke.points[1] ?? 0 },
      { id: "end", x: stroke.points[2] ?? stroke.points[0] ?? 0, y: stroke.points[3] ?? stroke.points[1] ?? 0 },
    ];
  }
  return [
    { id: "nw", x: box.x, y: box.y },
    { id: "n", x: box.x + box.w / 2, y: box.y },
    { id: "ne", x: box.x + box.w, y: box.y },
    { id: "e", x: box.x + box.w, y: box.y + box.h / 2 },
    { id: "se", x: box.x + box.w, y: box.y + box.h },
    { id: "s", x: box.x + box.w / 2, y: box.y + box.h },
    { id: "sw", x: box.x, y: box.y + box.h },
    { id: "w", x: box.x, y: box.y + box.h / 2 },
  ];
}

export function handleCursor(handle: TransformHandle): string {
  switch (handle) {
    case "n":
    case "s":
      return "ns-resize";
    case "e":
    case "w":
      return "ew-resize";
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
    case "start":
    case "end":
      return "grab";
    default:
      return "default";
  }
}

export function hitHandle(
  stroke: Stroke,
  box: Bounds,
  x: number,
  y: number,
  handleWorld: number,
): TransformHandle | null {
  const handles = handleCenters(stroke, box);
  const ranked = isLineTool(stroke.tool)
    ? handles
    : [...handles].sort((a, b) => {
        const weight = (id: TransformHandle) => (id === "start" || id === "end" ? 0 : id.length === 2 ? 0 : 1);
        return weight(a.id) - weight(b.id);
      });
  for (const handle of ranked) {
    if (Math.abs(x - handle.x) <= handleWorld && Math.abs(y - handle.y) <= handleWorld) {
      return handle.id;
    }
  }
  return null;
}

export function snapLineEnd(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x: number; y: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const angle = Math.atan2(dy, dx);
  const snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.hypot(dx, dy);
  return { x: x1 + Math.cos(snap) * len, y: y1 + Math.sin(snap) * len };
}

export function resizeBox(
  box: Bounds,
  handle: ResizeHandle,
  x: number,
  y: number,
  keepAspect: boolean,
  aspect: number,
): Bounds {
  let l = box.x;
  let t = box.y;
  let r = box.x + box.w;
  let b = box.y + box.h;
  const cx = (l + r) / 2;
  const cy = (t + b) / 2;
  const ratio = aspect > 0 && Number.isFinite(aspect) ? aspect : box.w / Math.max(1, box.h);

  switch (handle) {
    case "n":
      t = y;
      break;
    case "s":
      b = y;
      break;
    case "e":
      r = x;
      break;
    case "w":
      l = x;
      break;
    case "nw":
      l = x;
      t = y;
      break;
    case "ne":
      r = x;
      t = y;
      break;
    case "sw":
      l = x;
      b = y;
      break;
    case "se":
      r = x;
      b = y;
      break;
  }

  if (keepAspect && ratio > 0) {
    if (handle === "e" || handle === "w") {
      const w = Math.abs(r - l);
      const h = w / ratio;
      t = cy - h / 2;
      b = cy + h / 2;
    } else if (handle === "n" || handle === "s") {
      const h = Math.abs(b - t);
      const w = h * ratio;
      l = cx - w / 2;
      r = cx + w / 2;
    } else {
      const anchorX = handle.includes("w") ? box.x + box.w : box.x;
      const anchorY = handle.includes("n") ? box.y + box.h : box.y;
      let w = Math.abs(x - anchorX);
      let h = w / ratio;
      if (h < Math.abs(y - anchorY)) {
        h = Math.abs(y - anchorY);
        w = h * ratio;
      }
      l = handle.includes("w") ? anchorX - w : anchorX;
      r = handle.includes("w") ? anchorX : anchorX + w;
      t = handle.includes("n") ? anchorY - h : anchorY;
      b = handle.includes("n") ? anchorY : anchorY + h;
    }
  }

  if (r < l) {
    const tmp = l;
    l = r;
    r = tmp;
  }
  if (b < t) {
    const tmp = t;
    t = b;
    b = tmp;
  }
  if (r - l < MIN_SIZE) r = l + MIN_SIZE;
  if (b - t < MIN_SIZE) b = t + MIN_SIZE;
  return { x: l, y: t, w: r - l, h: b - t };
}

export function mapStrokeToBox(origin: Stroke, from: Bounds, to: Bounds): Stroke {
  if (isClosedShape(origin.tool) || isLineTool(origin.tool)) {
    return {
      ...origin,
      points: [to.x, to.y, to.x + to.w, to.y + to.h],
    };
  }
  if (origin.tool === "text") {
    const scaleY = to.h / Math.max(1, from.h);
    const nextSize = Math.max(1.25, origin.size * scaleY);
    const font = textFontSize(nextSize);
    return {
      ...origin,
      size: nextSize,
      textWidth: to.w,
      points: [to.x, to.y + font],
    };
  }
  const sx = to.w / Math.max(1, from.w);
  const sy = to.h / Math.max(1, from.h);
  return {
    ...origin,
    points: origin.points.map((value, index) =>
      index % 2 === 0 ? to.x + (value - from.x) * sx : to.y + (value - from.y) * sy,
    ),
  };
}

export function resizeStroke(
  origin: Stroke,
  originBox: Bounds,
  handle: TransformHandle,
  x: number,
  y: number,
  shift: boolean,
): Stroke {
  if (handle === "start" || handle === "end") {
    const points = origin.points.slice();
    if (handle === "start") {
      const endX = points[2] ?? x;
      const endY = points[3] ?? y;
      const next = shift ? snapLineEnd(endX, endY, x, y) : { x, y };
      points[0] = next.x;
      points[1] = next.y;
    } else {
      const startX = points[0] ?? x;
      const startY = points[1] ?? y;
      const next = shift ? snapLineEnd(startX, startY, x, y) : { x, y };
      points[2] = next.x;
      points[3] = next.y;
    }
    return { ...origin, points };
  }
  const aspect = originBox.w / Math.max(1, originBox.h);
  const nextBox = resizeBox(originBox, handle, x, y, shift, aspect);
  return mapStrokeToBox(origin, originBox, nextBox);
}

export function nudgeStroke(stroke: Stroke, dx: number, dy: number): Stroke {
  return {
    ...stroke,
    points: stroke.points.map((value, index) => value + (index % 2 === 0 ? dx : dy)),
  };
}
