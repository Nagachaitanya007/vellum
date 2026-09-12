import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, executeWriteBatch } from "@/lib/db";
import type { Note } from "./types";
import {
  loadVaultForUser,
  parseSavePayload,
  publicErrorMessage,
  saveVaultForUser,
  VaultError,
  type NotePayload,
  type VaultSnapshot,
} from "./vault-ops";

export type { NotePayload, VaultSnapshot };

function queryFromSql(sql: Awaited<ReturnType<typeof getSql>>) {
  return <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    sql.query<T>(text, params);
}

export const loadVault = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<VaultSnapshot> => {
    try {
      const sql = await getSql();
      return await loadVaultForUser(queryFromSql(sql), context.userId);
    } catch (error) {
      const pub = publicErrorMessage(error);
      if (pub.status === 401) throw error;
      console.error("[vault] load failed:", error instanceof Error ? error.message : error);
      throw new VaultError("Couldn't load notes", 500);
    }
  });

export const saveVaultChanges = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: unknown) => parseSavePayload(input))
  .handler(async ({ context, data }) => {
    try {
      const sql = await getSql();
      return await saveVaultForUser(queryFromSql(sql), context.userId, data, executeWriteBatch);
    } catch (error) {
      if (error instanceof VaultError) throw error;
      const pub = publicErrorMessage(error);
      if (pub.status === 401) throw error;
      console.error("[vault] save failed:", error instanceof Error ? error.message : error);
      throw new VaultError("Couldn't save notes", 500);
    }
  });

export function noteToPayload(note: Note): NotePayload {
  return {
    id: note.id,
    title: note.title,
    content: note.content,
    folderId: note.folderId,
    pinned: note.pinned,
    kind: note.kind,
    drawing: note.drawing,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}
