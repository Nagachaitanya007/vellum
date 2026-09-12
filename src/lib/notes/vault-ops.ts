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

function emptyDrawing(): Drawing {
  return { strokes: [] };
}

function normalizeIncomingDrawing(raw: unknown): Drawing {
  if (!raw || typeof raw !== "object") return emptyDrawing();
  const strokes = (raw as { strokes?: unknown }).strokes;
  if (!Array.isArray(strokes)) return emptyDrawing();
  return {
    strokes: strokes.filter((stroke): stroke is Stroke => {
      if (!stroke || typeof stroke !== "object") return false;
      const item = stroke as Stroke;
      if (!Array.isArray(item.points) || item.points.length < 2) return false;
      return STROKE_TOOLS.includes(item.tool);
    }),
  };
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

export type SaveInput = {
  notes?: unknown;
  deleted?: unknown;
  folders?: unknown;
  foldersUpdatedAt?: unknown;
  userId?: unknown;
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
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1e15) {
    throw new VaultError(`Invalid ${label}`);
  }
  return value;
}

function asString(value: unknown, max: number, label: string): string {
  if (typeof value !== "string") throw new VaultError(`Invalid ${label}`);
  if (value.length > max) throw new VaultError(`${label} is too large`);
  return value;
}

function asDrawing(raw: unknown): Drawing {
  const drawing = normalizeIncomingDrawing(raw);
  if (drawing.strokes.length > VAULT_LIMITS.maxStrokes) {
    throw new VaultError("Drawing has too many strokes");
  }
  for (const stroke of drawing.strokes) {
    if (stroke.points.length > VAULT_LIMITS.maxPointsPerStroke) {
      throw new VaultError("Drawing stroke is too large");
    }
  }
  let encoded: string;
  try {
    encoded = JSON.stringify(drawing);
  } catch {
    throw new VaultError("Invalid drawing");
  }
  if (encoded.length > VAULT_LIMITS.maxDrawingBytes) {
    throw new VaultError("Drawing is too large");
  }
  return drawing;
}

function parseNote(raw: unknown): NotePayload {
  if (!raw || typeof raw !== "object") throw new VaultError("Invalid note");
  const note = raw as Record<string, unknown>;
  const kind: NoteKind = note.kind === "canvas" ? "canvas" : "markdown";
  const folderId =
    note.folderId == null || note.folderId === ""
      ? null
      : asId(note.folderId, "folder id");
  return {
    id: asId(note.id, "note id"),
    title: asString(note.title ?? "", VAULT_LIMITS.maxTitleLength, "title"),
    content: asString(note.content ?? "", VAULT_LIMITS.maxContentLength, "content"),
    folderId,
    pinned: Boolean(note.pinned),
    kind,
    drawing: asDrawing(note.drawing),
    createdAt: asEpoch(note.createdAt ?? 0, "createdAt"),
    updatedAt: asEpoch(note.updatedAt ?? 0, "updatedAt"),
  };
}

function parseFolder(raw: unknown): Folder {
  if (!raw || typeof raw !== "object") throw new VaultError("Invalid folder");
  const folder = raw as Record<string, unknown>;
  return {
    id: asId(folder.id, "folder id"),
    name: asString(folder.name ?? "", VAULT_LIMITS.maxFolderNameLength, "folder name"),
  };
}

/** Rejects malformed / oversized payloads. Ignores any client-supplied userId. */
export function parseSavePayload(input: SaveInput): ValidatedSave {
  if (input == null || typeof input !== "object") {
    throw new VaultError("Invalid payload");
  }
  const notesRaw = input.notes ?? [];
  const deletedRaw = input.deleted ?? [];
  if (!Array.isArray(notesRaw)) throw new VaultError("Invalid notes");
  if (!Array.isArray(deletedRaw)) throw new VaultError("Invalid deleted list");
  if (notesRaw.length > VAULT_LIMITS.maxNotesPerSave) {
    throw new VaultError("Too many notes in one save");
  }
  if (deletedRaw.length > VAULT_LIMITS.maxDeletesPerSave) {
    throw new VaultError("Too many deletes in one save");
  }

  const notes = notesRaw.map(parseNote);
  const deleted = deletedRaw.map((item) => {
    if (!item || typeof item !== "object") throw new VaultError("Invalid delete");
    const tomb = item as Record<string, unknown>;
    return {
      id: asId(tomb.id, "deleted id"),
      deletedAt: asEpoch(tomb.deletedAt ?? Date.now(), "deletedAt"),
    };
  });

  let folders: Folder[] | undefined;
  let foldersUpdatedAt: number | undefined;
  if (input.folders !== undefined) {
    if (!Array.isArray(input.folders)) throw new VaultError("Invalid folders");
    if (input.folders.length > VAULT_LIMITS.maxFolders) {
      throw new VaultError("Too many folders");
    }
    folders = input.folders.map(parseFolder);
    foldersUpdatedAt = asEpoch(
      typeof input.foldersUpdatedAt === "number" ? input.foldersUpdatedAt : Date.now(),
      "foldersUpdatedAt",
    );
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
      return normalizeIncomingDrawing(JSON.parse(raw));
    } catch {
      return emptyDrawing();
    }
  }
  return normalizeIncomingDrawing(raw);
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

export async function saveVaultForUser(
  query: QueryFn,
  userId: string,
  data: ValidatedSave,
): Promise<{ ok: true }> {
  for (const note of data.notes) {
    await query(
      `insert into notes (
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
      [
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
    );
  }

  for (const tomb of data.deleted) {
    await query(
      `insert into notes (
          id, user_id, title, content, folder_id, pinned, drawing, created_at, updated_at, deleted_at
        ) values (?, ?, '', '', null, 0, '{"strokes":[]}', ?, ?, ?)
        on conflict (user_id, id) do update set
          deleted_at = excluded.deleted_at,
          updated_at = excluded.updated_at
        where coalesce(notes.deleted_at, notes.updated_at) <= excluded.deleted_at`,
      [tomb.id, userId, tomb.deletedAt, tomb.deletedAt, tomb.deletedAt],
    );
  }

  if (data.folders) {
    const updatedAt = data.foldersUpdatedAt ?? Date.now();
    await query(
      `insert into vault_settings (user_id, folders, updated_at)
       values (?, ?, ?)
       on conflict (user_id) do update set
         folders = excluded.folders,
         updated_at = excluded.updated_at
       where vault_settings.updated_at <= excluded.updated_at`,
      [userId, JSON.stringify(data.folders), updatedAt],
    );
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
