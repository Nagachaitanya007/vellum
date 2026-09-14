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
  | "triangle"
  | "pentagon"
  | "hexagon"
  | "star"
  | "arrow"
  | "text"
  | "hand";
export type DrawColor = "ink" | "red" | "blue" | "green" | "highlight";
export type DrawFill = "none" | "tint" | "solid";
export type StrokeTool =
  | "pen"
  | "highlighter"
  | "line"
  | "rect"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "pentagon"
  | "hexagon"
  | "star"
  | "arrow"
  | "text";

export type Stroke = {
  id: string;
  tool: StrokeTool;
  color: DrawColor;
  size: number;
  points: number[];
  text?: string;
  fill?: DrawFill;
  /** Wrap width in world units. Unset = auto-grow like Excalidraw unbound text. */
  textWidth?: number;
};

export type Drawing = {
  strokes: Stroke[];
};

export type GraphNodeShape = "circle" | "square" | "diamond" | "hex";
export type GraphColorBy = "folder" | "kind" | "pin" | "mono";
export type GraphSizeBy = "words" | "links" | "uniform";
export type GraphEdgeStyle = "line" | "arrow" | "dashed";
export type GraphEdgeColor = "muted" | "ink" | "red" | "blue" | "green";

export type GraphStyle = {
  nodeShape: GraphNodeShape;
  colorBy: GraphColorBy;
  sizeBy: GraphSizeBy;
  edgeStyle: GraphEdgeStyle;
  edgeColor: GraphEdgeColor;
  edgeWidth: 1 | 2 | 3;
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

export type VaultKind = "synced" | "local";

export type VaultRecord = {
  id: string;
  name: string;
  createdAt: number;
  kind: VaultKind;
};

export type VaultPayload = {
  notes: Note[];
  folders: Folder[];
  activeId: string | null;
  openTabIds: string[];
  filter: LibraryFilter;
  dirtyNoteIds: string[];
  pendingDeletes: string[];
  pendingDeleteAt: Record<string, number>;
  dirtyFolders: boolean;
  foldersUpdatedAt: number;
};

export const PRIMARY_VAULT_ID = "primary";

export type CreateNoteInput = {
  title?: string;
  content?: string;
  folderId?: string | null;
  pinned?: boolean;
  kind?: NoteKind;
  drawing?: Drawing;
};
