import type { DrawTool, StrokeTool } from "./types";

export type ExtraShape = {
  id: Extract<DrawTool, "triangle" | "pentagon" | "hexagon" | "star">;
  label: string;
  hint: string;
};

export const EXTRA_SHAPES: ExtraShape[] = [
  { id: "triangle", label: "Triangle", hint: "Three sides" },
  { id: "pentagon", label: "Pentagon", hint: "Five sides" },
  { id: "hexagon", label: "Hexagon", hint: "Six sides" },
  { id: "star", label: "Star", hint: "Five points" },
];

export const EXTRA_SHAPE_IDS: StrokeTool[] = EXTRA_SHAPES.map((item) => item.id);
