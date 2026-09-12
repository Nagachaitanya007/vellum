import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { emptyDrawing, normalizeDrawing } from "./drawing";
import type { Drawing, Folder, Note } from "./types";

export type NotePayload = {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  pinned: boolean;
  drawing: Drawing;
  createdAt: number;
  updatedAt: number;
};

export type VaultSnapshot = {
  notes: NotePayload[];
  deletedIds: string[];
  folders: Folder[] | null;
};

type NoteRow = {
  id: string;
  title: string;
  content: string;
  folder_id: string | null;
  pinned: boolean | string | number;
  drawing: unknown;
  created_at: number | string;
  updated_at: number | string;
  deleted_at: number | string | null;
};

type SettingsRow = {
  folders: unknown;
};

function asEpoch(value: number | string | null | undefined): number {
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

function parseDrawing(raw: unknown): Drawing {
  if (!raw) return emptyDrawing();
  if (typeof raw === "string") {
    try {
      return normalizeDrawing(JSON.parse(raw) as Partial<Drawing>);
    } catch {
      return emptyDrawing();
    }
  }
  return normalizeDrawing(raw as Partial<Drawing>);
}

function parseFolders(raw: unknown): Folder[] {
  const value = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
  if (!Array.isArray(value)) return [];
  return value
    .filter((folder): folder is Folder => {
      return (
        Boolean(folder) &&
        typeof folder === "object" &&
        typeof (folder as Folder).id === "string" &&
        typeof (folder as Folder).name === "string"
      );
    })
    .map((folder) => ({ id: folder.id, name: folder.name }));
}

function rowToNote(row: NoteRow): NotePayload {
  return {
    id: row.id,
    title: row.title ?? "",
    content: row.content ?? "",
    folderId: row.folder_id ?? null,
    pinned: asBool(row.pinned),
    drawing: parseDrawing(row.drawing),
    createdAt: asEpoch(row.created_at),
    updatedAt: asEpoch(row.updated_at),
  };
}

export const loadVault = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<VaultSnapshot> => {
    const sql = await getSql();
    const rows = await sql<NoteRow>`
      select id, title, content, folder_id, pinned, drawing, created_at, updated_at, deleted_at
      from notes
      where user_id = ${context.userId}
    `;
    const settings = await sql<SettingsRow>`
      select folders from vault_settings where user_id = ${context.userId}
    `;
    const notes: NotePayload[] = [];
    const deletedIds: string[] = [];
    for (const row of rows) {
      if (row.deleted_at != null) deletedIds.push(row.id);
      else notes.push(rowToNote(row));
    }
    return {
      notes,
      deletedIds,
      folders: settings[0] ? parseFolders(settings[0].folders) : null,
    };
  });

export const saveVaultChanges = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
    notes?: NotePayload[];
    deleted?: Array<{ id: string; deletedAt: number }>;
    folders?: Folder[];
  }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const userId = context.userId;

    for (const note of data.notes ?? []) {
      await sql.query(
        `insert into notes (
            id, user_id, title, content, folder_id, pinned, drawing, created_at, updated_at, deleted_at
          ) values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, null)
          on conflict (user_id, id) do update set
            title = excluded.title,
            content = excluded.content,
            folder_id = excluded.folder_id,
            pinned = excluded.pinned,
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
          note.pinned,
          JSON.stringify(note.drawing ?? emptyDrawing()),
          note.createdAt,
          note.updatedAt,
        ],
      );
    }

    for (const tomb of data.deleted ?? []) {
      await sql.query(
        `insert into notes (
            id, user_id, title, content, folder_id, pinned, drawing, created_at, updated_at, deleted_at
          ) values ($1, $2, '', '', null, false, '{"strokes":[]}'::jsonb, $3, $3, $3)
          on conflict (user_id, id) do update set
            deleted_at = excluded.deleted_at,
            updated_at = excluded.updated_at
          where notes.deleted_at is null or notes.deleted_at <= excluded.deleted_at`,
        [tomb.id, userId, tomb.deletedAt],
      );
    }

    if (data.folders) {
      const now = Date.now();
      await sql.query(
        `insert into vault_settings (user_id, folders, updated_at)
         values ($1, $2::jsonb, $3)
         on conflict (user_id) do update set
           folders = excluded.folders,
           updated_at = excluded.updated_at`,
        [userId, JSON.stringify(data.folders), now],
      );
    }

    return { ok: true as const };
  });

export function noteToPayload(note: Note): NotePayload {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    folderId: note.folderId,
    pinned: note.pinned,
    drawing: note.drawing,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}
