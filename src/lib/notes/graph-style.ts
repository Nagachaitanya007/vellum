import type {
  GraphColorBy,
  GraphEdgeColor,
  GraphEdgeStyle,
  GraphNodeShape,
  GraphSizeBy,
  GraphStyle,
  NoteKind,
} from "./types";

export const DEFAULT_GRAPH_STYLE: GraphStyle = {
  nodeShape: "circle",
  colorBy: "folder",
  sizeBy: "words",
  edgeStyle: "arrow",
  edgeColor: "muted",
  edgeWidth: 1,
};

const SHAPES: GraphNodeShape[] = ["circle", "square", "diamond", "hex"];
const COLOR_BY: GraphColorBy[] = ["folder", "kind", "pin", "mono"];
const SIZE_BY: GraphSizeBy[] = ["words", "links", "uniform"];
const EDGE_STYLES: GraphEdgeStyle[] = ["line", "arrow", "dashed"];
const EDGE_COLORS: GraphEdgeColor[] = ["muted", "ink", "red", "blue", "green"];

export function normalizeGraphStyle(raw?: Partial<GraphStyle> | null): GraphStyle {
  if (!raw) return { ...DEFAULT_GRAPH_STYLE };
  return {
    nodeShape: SHAPES.includes(raw.nodeShape as GraphNodeShape)
      ? (raw.nodeShape as GraphNodeShape)
      : DEFAULT_GRAPH_STYLE.nodeShape,
    colorBy: COLOR_BY.includes(raw.colorBy as GraphColorBy)
      ? (raw.colorBy as GraphColorBy)
      : DEFAULT_GRAPH_STYLE.colorBy,
    sizeBy: SIZE_BY.includes(raw.sizeBy as GraphSizeBy)
      ? (raw.sizeBy as GraphSizeBy)
      : DEFAULT_GRAPH_STYLE.sizeBy,
    edgeStyle: EDGE_STYLES.includes(raw.edgeStyle as GraphEdgeStyle)
      ? (raw.edgeStyle as GraphEdgeStyle)
      : DEFAULT_GRAPH_STYLE.edgeStyle,
    edgeColor: EDGE_COLORS.includes(raw.edgeColor as GraphEdgeColor)
      ? (raw.edgeColor as GraphEdgeColor)
      : DEFAULT_GRAPH_STYLE.edgeColor,
    edgeWidth: raw.edgeWidth === 2 || raw.edgeWidth === 3 ? raw.edgeWidth : 1,
  };
}

export type GraphNodeInfo = {
  id: string;
  title: string;
  pinned: boolean;
  folderId: string | null;
  kind: NoteKind;
  words: number;
  links: number;
};

const FOLDER_SWATCH = ["blue", "green", "red", "highlight"] as const;

export function folderSwatch(folderId: string | null): (typeof FOLDER_SWATCH)[number] | "muted" {
  if (!folderId) return "muted";
  let hash = 0;
  for (let i = 0; i < folderId.length; i += 1) {
    hash = (hash + folderId.charCodeAt(i) * (i + 3)) % FOLDER_SWATCH.length;
  }
  return FOLDER_SWATCH[hash] ?? "blue";
}

export function nodeWeight(node: GraphNodeInfo, sizeBy: GraphSizeBy): number {
  if (sizeBy === "uniform") return 1;
  if (sizeBy === "links") return node.links + 1;
  return Math.max(1, node.words);
}

export function nodeRadius(weight: number, minW: number, maxW: number): number {
  if (maxW <= minW) return 9;
  const t = (weight - minW) / (maxW - minW);
  return 6 + t * 16;
}

export function paintNodeShape(
  ctx: CanvasRenderingContext2D,
  shape: GraphNodeShape,
  x: number,
  y: number,
  r: number,
) {
  ctx.beginPath();
  if (shape === "square") {
    const s = r * 1.7;
    ctx.rect(x - s / 2, y - s / 2, s, s);
    return;
  }
  if (shape === "diamond") {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    return;
  }
  if (shape === "hex") {
    for (let i = 0; i < 6; i += 1) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    return;
  }
  ctx.arc(x, y, r, 0, Math.PI * 2);
}
