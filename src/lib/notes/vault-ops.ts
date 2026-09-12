import type { Drawing, Folder, NoteKind, Stroke, StrokeTool } from "./types.ts";

export const VAULT_LIMITS = {
  maxIdLength: 128,
  maxTitleLength: 8_192,
  maxContentLength: 512_000,
  maxDrawingBytes: 1_500_000,
  maxNotesPerSave: 200,
  maxDeletesPerSave: 200,
  maxFolders: 100,
  maxFolderNameLength: 200,
  maxStrokes: 8_000,
  maxPointsPerStroke: 20_000,
} as const;

const ID_RE = /^[\w.-]{1,128}$/;

const STROKE_TOOLS: StrokeTool[] = [
  "pen",
  "highlighter",
  "line",
  "rect",
  "ellipse",
  "diamond",
  "triangle",
  "pentagon",
  "hexagon",
  "star",
  "arrow",
  "text",
];

const DRAW_COLORS = ["ink", "red", "blue", "green", "highlight"] as const;
const DRAW_FILLS = ["none", "tint", "solid"] as const;

function emptyDrawing(): Drawing {
  return { strokes: [] };
}

export class VaultError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "VaultError";
    this.status = status;
  }
}

export type QueryFn = <T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;

export type Statement = { sql: string; args: unknown[] };

export type BatchFn = (statements: Statement[]) => Promise<void>;

export type NotePayload = {
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

export type VaultSnapshot = {
  notes: NotePayload[];
  deletedIds: string[];
  deletedAt: Record<string, number>;
  folders: Folder[] | null;
  foldersUpdatedAt: number | null;
};

export type ValidatedSave = {
  notes: NotePayload[];
  deleted: Array<{ id: string; deletedAt: number }>;
  folders: Folder[] | undefined;
  foldersUpdatedAt: number | undefined;
};

function asId(value: unknown, label: string): string {
  if (typeof value !== "string" || !ID_RE.test(value)) {
    throw new VaultError(`Invalid ${label}`);
  }
  return value;
}

function asEpoch(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1e15) {
    throw new VaultError(`Invalid ${label}`);
  }
  return value;
}

function asString(value: unknown, max: number, label: string): string {
  if (typeof value !== "string") throw new VaultError(`Invalid ${label}`);
  if (value.length > max) throw new VaultError(`${label} is too large`);
  return value;
}

function asBoolean(value: unknown, label: string): boolean {
  if (value === true || value === false) return value;
  throw new VaultError(`Invalid ${label}`);
}

function asKind(value: unknown): NoteKind {
  if (value === "canvas" || value === "markdown") return value;
  throw new VaultError("Invalid kind");
}

function asFolderId(value: unknown): string | null {
  if (value === null) return null;
  return asId(value, "folder id");
}

function asStroke(raw: unknown): Stroke {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new VaultError("Invalid drawing");
  }
  const item = raw as Record<string, unknown>;
  if (!STROKE_TOOLS.includes(item.tool as StrokeTool)) {
    throw new VaultError("Invalid drawing");
  }
  if (typeof item.id !== "string" || item.id.length === 0 || item.id.length > 128) {
    throw new VaultError("Invalid drawing");
  }
  if (!DRAW_COLORS.includes(item.color as (typeof DRAW_COLORS)[number])) {
    throw new VaultError("Invalid drawing");
  }
  if (typeof item.size !== "number" || !Number.isFinite(item.size) || item.size <= 0) {
    throw new VaultError("Invalid drawing");
  }
  if (!Array.isArray(item.points) || item.points.length < 2) {
    throw new VaultError("Invalid drawing");
  }
  if (item.points.length > VAULT_LIMITS.maxPointsPerStroke) {
    throw new VaultError("Drawing stroke is too large");
  }
  for (const point of item.points) {
    if (typeof point !== "number" || !Number.isFinite(point)) {
      throw new VaultError("Invalid drawing");
    }
  }
  const stroke: Stroke = {
    id: item.id,
    tool: item.tool as StrokeTool,
    color: item.color as Stroke["color"],
    size: item.size,
    points: item.points as number[],
  };
  if (item.text !== undefined) {
    if (typeof item.text !== "string") throw new VaultError("Invalid drawing");
    stroke.text = item.text;
  }
  if (item.fill !== undefined) {
    if (!DRAW_FILLS.includes(item.fill as (typeof DRAW_FILLS)[number])) {
      throw new VaultError("Invalid drawing");
    }
    stroke.fill = item.fill as Stroke["fill"];
  }
  if (item.textWidth !== undefined) {
    if (typeof item.textWidth !== "number" || !Number.isFinite(item.textWidth)) {
      throw new VaultError("Invalid drawing");
    }
    stroke.textWidth = item.textWidth;
  }
  return stroke;
}

function asDrawing(raw: unknown): Drawing {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new VaultError("Invalid drawing");
  }
  const strokesRaw = (raw as { strokes?: unknown }).strokes;
  if (!Array.isArray(strokesRaw)) throw new VaultError("Invalid drawing");
  if (strokesRaw.length > VAULT_LIMITS.maxStrokes) {
    throw new VaultError("Drawing has too many strokes");
  }
  const strokes = strokesRaw.map(asStroke);
  let encoded: string;
  try {
    encoded = JSON.stringify({ strokes });
  } catch {
    throw new VaultError("Invalid drawing");
  }
  if (encoded.length > VAULT_LIMITS.maxDrawingBytes) {
    throw new VaultError("Drawing is too large");
  }
  return { strokes };
}

function parseNote(raw: unknown): NotePayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new VaultError("Invalid note");
  }
  const note = raw as Record<string, unknown>;
  return {
    id: asId(note.id, "note id"),
    title: asString(note.title, VAULT_LIMITS.maxTitleLength, "title"),
    content: asString(note.content, VAULT_LIMITS.maxContentLength, "content"),
    folderId: asFolderId(note.folderId),
    pinned: asBoolean(note.pinned, "pinned"),
    kind: asKind(note.kind),
    drawing: asDrawing(note.drawing),
    createdAt: asEpoch(note.createdAt, "createdAt"),
    updatedAt: asEpoch(note.updatedAt, "updatedAt"),
  };
}

function parseFolder(raw: unknown): Folder {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new VaultError("Invalid folder");
  }
  const folder = raw as Record<string, unknown>;
  return {
    id: asId(folder.id, "folder id"),
    name: asString(folder.name, VAULT_LIMITS.maxFolderNameLength, "folder name"),
  };
}

function parseDelete(raw: unknown): { id: string; deletedAt: number } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new VaultError("Invalid delete");
  }
  const tomb = raw as Record<string, unknown>;
  return {
    id: asId(tomb.id, "deleted id"),
    deletedAt: asEpoch(tomb.deletedAt, "deletedAt"),
  };
}

/** Rejects malformed / oversized payloads. Ignores any client-supplied userId. */
export function parseSavePayload(input: unknown): ValidatedSave {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    throw new VaultError("Invalid payload");
  }
  const body = input as Record<string, unknown>;
  const notesRaw = body.notes === undefined ? [] : body.notes;
  const deletedRaw = body.deleted === undefined ? [] : body.deleted;
  if (!Array.isArray(notesRaw)) throw new VaultError("Invalid notes");
  if (!Array.isArray(deletedRaw)) throw new VaultError("Invalid deleted list");
  if (notesRaw.length > VAULT_LIMITS.maxNotesPerSave) {
    throw new VaultError("Too many notes in one save");
  }
  if (deletedRaw.length > VAULT_LIMITS.maxDeletesPerSave) {
    throw new VaultError("Too many deletes in one save");
  }

  const notes = notesRaw.map(parseNote);
  const deleted = deletedRaw.map(parseDelete);

  let folders: Folder[] | undefined;
  let foldersUpdatedAt: number | undefined;
  if (body.folders !== undefined) {
    if (!Array.isArray(body.folders)) throw new VaultError("Invalid folders");
    if (body.folders.length > VAULT_LIMITS.maxFolders) {
      throw new VaultError("Too many folders");
    }
    folders = body.folders.map(parseFolder);
    foldersUpdatedAt = asEpoch(body.foldersUpdatedAt, "foldersUpdatedAt");
  } else if (body.foldersUpdatedAt !== undefined) {
    throw new VaultError("Invalid folders");
  }

  return { notes, deleted, folders, foldersUpdatedAt };
}

function asRowEpoch(value: number | string | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function asBool(value: boolean | string | number): boolean {
  return value === true || value === "t" || value === "true" || value === 1;
}

function parseDrawingColumn(raw: unknown): Drawing {
  if (!raw) return emptyDrawing();
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return emptyDrawing();
      const strokes = (parsed as { strokes?: unknown }).strokes;
      if (!Array.isArray(strokes)) return emptyDrawing();
      const clean: Stroke[] = [];
      for (const stroke of strokes) {
        try {
          clean.push(asStroke(stroke));
        } catch {
          /* skip a corrupt stored stroke rather than dropping the note */
        }
      }
      return { strokes: clean };
    } catch {
      return emptyDrawing();
    }
  }
  if (typeof raw === "object") {
    try {
      return asDrawing(raw);
    } catch {
      return emptyDrawing();
    }
  }
  return emptyDrawing();
}

function parseFoldersColumn(raw: unknown): Folder[] {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const folders: Folder[] = [];
  for (const folder of value) {
    if (!folder || typeof folder !== "object") continue;
    const id = (folder as Folder).id;
    const name = (folder as Folder).name;
    if (typeof id !== "string" || typeof name !== "string") continue;
    folders.push({ id, name });
  }
  return folders;
}

type NoteRow = {
  id: string;
  title: string;
  content: string;
  folder_id: string | null;
  pinned: boolean | string | number;
  kind?: string | null;
  drawing: unknown;
  created_at: number | string;
  updated_at: number | string;
  deleted_at: number | string | null;
};

type SettingsRow = {
  folders: unknown;
  updated_at: number | string;
};

export async function loadVaultForUser(query: QueryFn, userId: string): Promise<VaultSnapshot> {
  const rows = await query<NoteRow>(
    `select id, title, content, folder_id, pinned, kind, drawing, created_at, updated_at, deleted_at
     from notes
     where user_id = ?`,
    [userId],
  );
  const settings = await query<SettingsRow>(
    `select folders, updated_at from vault_settings where user_id = ?`,
    [userId],
  );
  const notes: NotePayload[] = [];
  const deletedIds: string[] = [];
  const deletedAt: Record<string, number> = {};
  for (const row of rows) {
    if (row.deleted_at != null) {
      deletedIds.push(row.id);
      deletedAt[row.id] = asRowEpoch(row.deleted_at);
    } else {
      notes.push({
        id: row.id,
        title: row.title ?? "",
        content: row.content ?? "",
        folderId: row.folder_id ?? null,
        pinned: asBool(row.pinned),
        kind: row.kind === "canvas" ? "canvas" : "markdown",
        drawing: parseDrawingColumn(row.drawing),
        createdAt: asRowEpoch(row.created_at),
        updatedAt: asRowEpoch(row.updated_at),
      });
    }
  }
  const setting = settings[0];
  return {
    notes,
    deletedIds,
    deletedAt,
    folders: setting ? parseFoldersColumn(setting.folders) : null,
    foldersUpdatedAt: setting ? asRowEpoch(setting.updated_at) : null,
  };
}

export function buildSaveStatements(userId: string, data: ValidatedSave): Statement[] {
  const statements: Statement[] = [];

  for (const note of data.notes) {
    statements.push({
      sql: `insert into notes (
          id, user_id, title, content, folder_id, pinned, kind, drawing, created_at, updated_at, deleted_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null)
        on conflict (user_id, id) do update set
          title = excluded.title,
          content = excluded.content,
          folder_id = excluded.folder_id,
          pinned = excluded.pinned,
          kind = excluded.kind,
          drawing = excluded.drawing,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          deleted_at = null
        where notes.updated_at <= excluded.updated_at`,
      args: [
        note.id,
        userId,
        note.title,
        note.content,
        note.folderId,
        note.pinned ? 1 : 0,
        note.kind === "canvas" ? "canvas" : "markdown",
        JSON.stringify(note.drawing ?? emptyDrawing()),
        note.createdAt,
        note.updatedAt,
      ],
    });
  }

  for (const tomb of data.deleted) {
    statements.push({
      sql: `insert into notes (
          id, user_id, title, content, folder_id, pinned, drawing, created_at, updated_at, deleted_at
        ) values (?, ?, '', '', null, 0, '{"strokes":[]}', ?, ?, ?)
        on conflict (user_id, id) do update set
          deleted_at = excluded.deleted_at,
          updated_at = excluded.updated_at
        where coalesce(notes.deleted_at, notes.updated_at) <= excluded.deleted_at`,
      args: [tomb.id, userId, tomb.deletedAt, tomb.deletedAt, tomb.deletedAt],
    });
  }

  if (data.folders) {
    const updatedAt = data.foldersUpdatedAt;
    if (typeof updatedAt !== "number") {
      throw new VaultError("Invalid foldersUpdatedAt");
    }
    statements.push({
      sql: `insert into vault_settings (user_id, folders, updated_at)
       values (?, ?, ?)
       on conflict (user_id) do update set
         folders = excluded.folders,
         updated_at = excluded.updated_at
       where vault_settings.updated_at <= excluded.updated_at`,
      args: [userId, JSON.stringify(data.folders), updatedAt],
    });
  }

  return statements;
}

export async function saveVaultForUser(
  query: QueryFn,
  userId: string,
  data: ValidatedSave,
  batch?: BatchFn,
): Promise<{ ok: true }> {
  const statements = buildSaveStatements(userId, data);
  if (statements.length === 0) return { ok: true };
  if (batch) {
    await batch(statements);
    return { ok: true };
  }
  for (const statement of statements) {
    await query(statement.sql, statement.args);
  }
  return { ok: true };
}

export function publicErrorMessage(error: unknown): { message: string; status: number } {
  if (error instanceof VaultError) return { message: error.message, status: error.status };
  if (error && typeof error === "object" && "status" in error && (error as { status: number }).status === 401) {
    return { message: "Unauthorized", status: 401 };
  }
  return { message: "Couldn't save notes", status: 500 };
}
