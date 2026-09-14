import { format } from "date-fns";
import { displayTitle, extractTags } from "./helpers.ts";
import type { Folder, Note } from "./types.ts";

const encoder = new TextEncoder();

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function yamlScalar(value: string): string {
  if (value.length === 0) return '""';
  if (/^[\w ./-]+$/.test(value) && !/^[-:]/.test(value)) return value;
  return JSON.stringify(value);
}

export function safeSegment(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .slice(0, 80);
  return cleaned || "Untitled";
}

export function noteToMarkdown(note: Note, folderName: string | null): string {
  const tags = extractTags(note.content);
  const lines = [
    "---",
    `title: ${yamlScalar(displayTitle(note.title))}`,
    `folder: ${yamlScalar(folderName ?? "Unfiled")}`,
    `pinned: ${note.pinned ? "true" : "false"}`,
    `kind: ${note.kind}`,
    `created: ${new Date(note.createdAt).toISOString()}`,
    `updated: ${new Date(note.updatedAt).toISOString()}`,
  ];
  if (tags.length > 0) lines.push(`tags: [${tags.map(yamlScalar).join(", ")}]`);
  if (note.drawing.strokes.length > 0) lines.push("drawing: sidecar");
  lines.push("---", "", note.content.replace(/\s+$/, ""), "");
  return lines.join("\n");
}

function folderNameFor(note: Note, folders: Folder[]): string {
  if (!note.folderId) return "Unfiled";
  return folders.find((folder) => folder.id === note.folderId)?.name ?? "Unfiled";
}

function uniquePath(used: Set<string>, path: string): string {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const dot = path.lastIndexOf(".");
  const stem = dot === -1 ? path : path.slice(0, dot);
  const ext = dot === -1 ? "" : path.slice(dot);
  let i = 2;
  while (used.has(`${stem}-${i}${ext}`)) i += 1;
  const next = `${stem}-${i}${ext}`;
  used.add(next);
  return next;
}

type ZipFile = { name: string; bytes: Uint8Array };

function zipStore(files: ZipFile[]): Blob {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const { bytes } = file;
    const crc = crc32(bytes);
    const local = new Uint8Array(30 + name.length + bytes.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint16(8, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, bytes.length, true);
    view.setUint32(22, bytes.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(bytes, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const cview = new DataView(central.buffer);
    cview.setUint32(0, 0x02014b50, true);
    cview.setUint16(4, 20, true);
    cview.setUint16(6, 20, true);
    cview.setUint16(8, 0x0800, true);
    cview.setUint32(16, crc, true);
    cview.setUint32(20, bytes.length, true);
    cview.setUint32(24, bytes.length, true);
    cview.setUint16(28, name.length, true);
    cview.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const eview = new DataView(end.buffer);
  eview.setUint32(0, 0x06054b50, true);
  eview.setUint16(8, files.length, true);
  eview.setUint16(10, files.length, true);
  eview.setUint32(12, centralSize, true);
  eview.setUint32(16, offset, true);

  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of localParts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  for (const part of centralParts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  out.set(end, cursor);
  return new Blob([out], { type: "application/zip" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function exportNoteMarkdown(note: Note, folders: Folder[]) {
  const folder = folderNameFor(note, folders);
  const markdown = noteToMarkdown(note, folder === "Unfiled" ? null : folder);
  const filename = `${safeSegment(displayTitle(note.title))}.md`;
  downloadBlob(new Blob([markdown], { type: "text/markdown;charset=utf-8" }), filename);
}

export type ExportScope =
  | { type: "vault" }
  | { type: "folder"; folderId: string | null }
  | { type: "notes"; ids: string[] }
  | { type: "note"; id: string };

export function notesForExport(notes: Note[], scope: ExportScope): Note[] {
  switch (scope.type) {
    case "vault":
      return notes;
    case "folder":
      return notes.filter((note) => note.folderId === scope.folderId);
    case "notes": {
      const want = new Set(scope.ids);
      return notes.filter((note) => want.has(note.id));
    }
    case "note":
      return notes.filter((note) => note.id === scope.id);
  }
}

export function exportVaultZip(
  notes: Note[],
  folders: Folder[],
  options: { filename?: string; vaultName?: string } = {},
) {
  const used = new Set<string>();
  const files: ZipFile[] = [];
  const vaultName = options.vaultName?.trim() || "Vellum";
  const readme = [
    `${vaultName} export`,
    "",
    "This is a download of a Vellum vault — a copy of notes, not the live workspace.",
    "Drop this folder into Google Drive (or any other files app).",
    "Each .md file is one note. Wiki links use [[Page title]].",
    "If a note had a drawing, a matching .drawing.json sits beside it.",
    "",
  ].join("\n");
  files.push({ name: "README.txt", bytes: encoder.encode(readme) });

  for (const note of notes) {
    const folder = safeSegment(folderNameFor(note, folders));
    const stem = `${folder}/${safeSegment(displayTitle(note.title))}`;
    const mdPath = uniquePath(used, `${stem}.md`);
    files.push({
      name: mdPath,
      bytes: encoder.encode(noteToMarkdown(note, folderNameFor(note, folders))),
    });
    if (note.drawing.strokes.length > 0) {
      const drawPath = uniquePath(used, `${stem}.drawing.json`);
      files.push({
        name: drawPath,
        bytes: encoder.encode(`${JSON.stringify(note.drawing, null, 2)}\n`),
      });
    }
  }

  const stamp = format(new Date(), "yyyy-MM-dd");
  const filename = options.filename ?? `vellum-notes-${stamp}.zip`;
  downloadBlob(zipStore(files), filename);
}

export function exportScope(
  notes: Note[],
  folders: Folder[],
  scope: ExportScope,
  options: { vaultName?: string } = {},
) {
  const selected = notesForExport(notes, scope);
  if (selected.length === 1 && selected[0] && (scope.type === "note" || scope.type === "notes")) {
    exportNoteMarkdown(selected[0], folders);
    return;
  }
  const vaultName = options.vaultName?.trim() || "Vellum";
  const stamp = format(new Date(), "yyyy-MM-dd");
  let filename = `${safeSegment(vaultName)}-${stamp}.zip`;
  if (scope.type === "folder") {
    const folder =
      scope.folderId === null
        ? "Unfiled"
        : (folders.find((item) => item.id === scope.folderId)?.name ?? "Folder");
    filename = `${safeSegment(vaultName)}-${safeSegment(folder)}-${stamp}.zip`;
  }
  exportVaultZip(selected, folders, { filename, vaultName });
}
