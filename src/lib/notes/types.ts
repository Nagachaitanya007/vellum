export type PreviewMode = "edit" | "preview" | "split";
export type ThemeMode = "light" | "dark";
export type WorkspaceView = "notes" | "graph";
export type ListMode = "list" | "table";
export type SyncStatus = "local" | "syncing" | "synced" | "error";
export type NoteKind = "markdown" | "canvas";

export type Folder = {
  id: string;
  name: string;
};

export type DrawTool =
  | "select"
  | "pen"
  | "highlighter"
  | "eraser"
  | "line"
  | "rect"
  | "ellipse"
  | "diamond"
  | "arrow"
  | "text"
  | "hand";
export type DrawColor = "ink" | "red" | "blue" | "green" | "highlight";
export type StrokeTool =
  | "pen"
  | "highlighter"
  | "line"
  | "rect"
  | "ellipse"
  | "diamond"
  | "arrow"
  | "text";

export type Stroke = {
  id: string;
  tool: StrokeTool;
  color: DrawColor;
  size: number;
  points: number[];
  text?: string;
};

export type Drawing = {
  strokes: Stroke[];
};

export type Note = {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  pinned: boolean;
  kind: NoteKind;
  drawing: Drawing;
  createdAt: number;
  updatedAt: number;
};

export type LibraryFilter =
  | { type: "all" }
  | { type: "pinned" }
  | { type: "unfiled" }
  | { type: "daily" }
  | { type: "folder"; id: string }
  | { type: "tag"; tag: string };

export type CreateNoteInput = {
  title?: string;
  content?: string;
  folderId?: string | null;
  pinned?: boolean;
  kind?: NoteKind;
  drawing?: Drawing;
};
