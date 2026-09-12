import { newStrokeId } from "./drawing";
import type { DrawColor, DrawFill, Stroke, StrokeTool } from "./types";

function shape(
  tool: StrokeTool,
  color: DrawColor,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  text: string,
  fill: DrawFill = "tint",
): Stroke {
  return {
    id: newStrokeId(),
    tool,
    color,
    size: 2,
    points: [x1, y1, x2, y2],
    text,
    fill,
  };
}

function arrow(color: DrawColor, x1: number, y1: number, x2: number, y2: number): Stroke {
  return {
    id: newStrokeId(),
    tool: "arrow",
    color,
    size: 2,
    points: [x1, y1, x2, y2],
  };
}

function line(color: DrawColor, x1: number, y1: number, x2: number, y2: number): Stroke {
  return {
    id: newStrokeId(),
    tool: "line",
    color,
    size: 2,
    points: [x1, y1, x2, y2],
  };
}

export type DiagramPreset = {
  id: string;
  label: string;
  hint: string;
  build: () => Stroke[];
};

export const DIAGRAM_PRESETS: DiagramPreset[] = [
  {
    id: "flow",
    label: "Flowchart",
    hint: "Start, decide, ship",
    build: () => [
      shape("ellipse", "green", -70, -210, 70, -150, "Start", "tint"),
      arrow("ink", 0, -150, 0, -118),
      shape("rect", "blue", -90, -118, 90, -58, "Do the work", "tint"),
      arrow("ink", 0, -58, 0, -26),
      shape("diamond", "highlight", -100, -26, 100, 70, "Ready?", "tint"),
      arrow("ink", 100, 22, 168, 22),
      shape("rect", "red", 168, -8, 300, 52, "Revise", "tint"),
      arrow("red", 234, 52, 234, 96),
      line("red", 234, 96, 0, 96),
      arrow("red", 0, 96, 0, 70),
      arrow("ink", 0, 70, 0, 102),
      shape("ellipse", "green", -70, 102, 70, 162, "Ship", "solid"),
    ],
  },
  {
    id: "sequence",
    label: "Sequence",
    hint: "Three actors talking",
    build: () => [
      shape("ellipse", "blue", -210, -160, -90, -104, "Ada", "tint"),
      shape("ellipse", "green", -60, -160, 60, -104, "Grace", "tint"),
      shape("ellipse", "highlight", 90, -160, 210, -104, "Ed", "tint"),
      line("ink", -150, -104, -150, 140),
      line("ink", 0, -104, 0, 140),
      line("ink", 150, -104, 150, 140),
      arrow("blue", -150, -60, 0, -60),
      shape("rect", "blue", -90, -84, -20, -36, "Ask", "none"),
      arrow("green", 0, 0, 150, 0),
      shape("rect", "green", 20, -24, 100, 24, "Compile", "none"),
      arrow("highlight", 150, 60, -150, 60),
      shape("rect", "highlight", -40, 36, 40, 84, "Ship", "none"),
    ],
  },
  {
    id: "mind",
    label: "Mind map",
    hint: "A hub and four leaves",
    build: () => [
      shape("ellipse", "highlight", -80, -40, 80, 40, "Idea", "solid"),
      arrow("blue", -80, 0, -170, 0),
      shape("rect", "blue", -300, -32, -170, 32, "Research", "tint"),
      arrow("green", 80, 0, 170, 0),
      shape("rect", "green", 170, -32, 300, 32, "Write", "tint"),
      arrow("red", 0, -40, 0, -110),
      shape("rect", "red", -70, -170, 70, -110, "Question", "tint"),
      arrow("ink", 0, 40, 0, 110),
      shape("rect", "ink", -70, 110, 70, 170, "Keep", "tint"),
    ],
  },
  {
    id: "cycle",
    label: "Cycle",
    hint: "Three looping steps",
    build: () => [
      shape("diamond", "blue", -70, -180, 70, -70, "Notice", "tint"),
      shape("diamond", "green", 90, 20, 230, 130, "Change", "tint"),
      shape("diamond", "highlight", -230, 20, -90, 130, "Review", "tint"),
      arrow("ink", 50, -70, 140, 28),
      arrow("ink", 90, 90, -90, 90),
      arrow("ink", -140, 28, -50, -70),
    ],
  },
  {
    id: "compare",
    label: "Compare",
    hint: "Two columns",
    build: () => [
      shape("rect", "blue", -220, -90, -20, 90, "Now", "tint"),
      shape("diamond", "highlight", -28, -28, 28, 28, "or", "none"),
      shape("rect", "green", 20, -90, 220, 90, "Next", "tint"),
    ],
  },
  {
    id: "org",
    label: "Org chart",
    hint: "Lead and three reports",
    build: () => [
      shape("rect", "highlight", -90, -160, 90, -90, "Lead", "solid"),
      line("ink", 0, -90, 0, -50),
      line("ink", -180, -50, 180, -50),
      line("ink", -180, -50, -180, -10),
      line("ink", 0, -50, 0, -10),
      line("ink", 180, -50, 180, -10),
      shape("rect", "blue", -250, -10, -110, 60, "Design", "tint"),
      shape("rect", "green", -70, -10, 70, 60, "Build", "tint"),
      shape("rect", "red", 110, -10, 250, 60, "Ship", "tint"),
    ],
  },
];
