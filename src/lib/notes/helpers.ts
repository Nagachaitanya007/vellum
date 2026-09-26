import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import type { LibraryFilter, Note } from "./types.ts";

export function displayTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : "Untitled";
}

export function snippet(content: string, max = 88): string {
  const text = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/!\[\[([^\]|#]+)\]\]/g, "$1")
    .replace(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g, (_full, title: string, alias?: string) => alias || title)
    .replace(/[#>*_~[\]()!-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "Empty note";
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export function wordCount(content: string): number {
  const parts = content.trim().split(/\s+/).filter(Boolean);
  return parts.length;
}

export function formatEdited(ts: number, now = Date.now()): string {
  if (now - ts < 45_000) return "Just now";
  if (isToday(ts)) {
    return formatDistanceToNowStrict(ts, { addSuffix: true });
  }
  if (isYesterday(ts)) return "Yesterday";
  const year = new Date(ts).getFullYear();
  const thisYear = new Date(now).getFullYear();
  return format(ts, year === thisYear ? "MMM d" : "MMM d, yyyy");
}

export function wrapSelection(
  value: string,
  start: number,
  end: number,
  before: string,
  after = before,
): { value: string; start: number; end: number } {
  const selected = value.slice(start, end);
  if (
    start >= before.length &&
    value.slice(start - before.length, start) === before &&
    value.slice(end, end + after.length) === after
  ) {
    return {
      value: value.slice(0, start - before.length) + selected + value.slice(end + after.length),
      start: start - before.length,
      end: end - before.length,
    };
  }
  return {
    value: value.slice(0, start) + before + selected + after + value.slice(end),
    start: start + before.length,
    end: end + before.length,
  };
}

/** True when `index` sits inside an unclosed ``` fenced code block. */
export function isInsideFencedCode(value: string, index: number): boolean {
  let inFence = false;
  let i = 0;
  const end = Math.max(0, Math.min(index, value.length));
  while (i < end) {
    const nl = value.indexOf("\n", i);
    const lineEnd = nl === -1 || nl > end ? end : nl;
    const line = value.slice(i, lineEnd);
    if (/^ {0,3}```/.test(line)) inFence = !inFence;
    if (nl === -1 || nl >= end) break;
    i = nl + 1;
  }
  return inFence;
}

export function extractWikiLinks(content: string): string[] {
  const out: string[] = [];
  const re = /!?\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) {
    const title = match[1]?.trim();
    if (!title) continue;
    if (!out.some((item) => item.toLowerCase() === title.toLowerCase())) {
      out.push(title);
    }
  }
  return out;
}

export function extractTags(content: string): string[] {
  const stripped = content.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
  const out: string[] = [];
  const re = /(^|[\s(])#([A-Za-z][\w-]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(stripped))) {
    const tag = match[2]?.toLowerCase();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

export function findNoteByTitle(notes: Note[], title: string): Note | undefined {
  const needle = title.trim().toLowerCase();
  return notes.find((note) => note.title.trim().toLowerCase() === needle);
}

export function backlinksTo(notes: Note[], note: Note): Note[] {
  const title = displayTitle(note.title).toLowerCase();
  return notes.filter(
    (other) =>
      other.id !== note.id &&
      extractWikiLinks(other.content).some((link) => link.toLowerCase() === title),
  );
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function withoutWikiAndCode(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[\[.*?\]\]/g, " ")
    .replace(/\[\[.*?\]\]/g, " ");
}

export function unlinkedMentions(notes: Note[], note: Note): Note[] {
  const title = displayTitle(note.title);
  if (title === "Untitled" || title.length < 3) return [];
  const re = new RegExp(`\\b${escapeRegExp(title)}\\b`, "i");
  const needle = title.toLowerCase();
  return notes.filter((other) => {
    if (other.id === note.id) return false;
    if (extractWikiLinks(other.content).some((link) => link.toLowerCase() === needle)) return false;
    return re.test(withoutWikiAndCode(other.content));
  });
}

export function convertMentionToLink(content: string, title: string): string {
  const re = new RegExp(`(?<!\\[\\[)\\b(${escapeRegExp(title)})\\b(?!\\]\\])`, "i");
  return content.replace(re, "[[$1]]");
}

export function allTags(notes: Note[]): string[] {
  const set = new Set<string>();
  for (const note of notes) {
    for (const tag of extractTags(note.content)) set.add(tag);
  }
  return [...set].sort();
}

export function dailyTitle(now = new Date()): string {
  return format(now, "MMM d, yyyy");
}

export function isDailyTitle(title: string, now = new Date()): boolean {
  return title.trim().toLowerCase() === dailyTitle(now).toLowerCase();
}

export function toggleTaskAt(content: string, index: number): string {
  let i = 0;
  return content.replace(/^(\s*[-*+]\s+)\[([ xX])\]/gm, (full, prefix: string, mark: string) => {
    if (i++ !== index) return full;
    return `${prefix}[${mark.trim() ? " " : "x"}]`;
  });
}

export function openWikiQuery(value: string, cursor: number): string | null {
  if (isInsideFencedCode(value, cursor)) return null;
  const before = value.slice(0, cursor);
  const match = /\[\[([^[\]]*)$/.exec(before);
  if (!match) return null;
  if (before.lastIndexOf("]]") > before.lastIndexOf("[[")) return null;
  return match[1] ?? "";
}

export function insertWikiLink(
  value: string,
  cursor: number,
  title: string,
): { value: string; cursor: number } {
  const before = value.slice(0, cursor);
  const match = /\[\[([^[\]]*)$/.exec(before);
  if (!match) {
    const next = `${value.slice(0, cursor)}[[${title}]]${value.slice(cursor)}`;
    return { value: next, cursor: cursor + title.length + 4 };
  }
  const start = cursor - match[0].length;
  const next = `${value.slice(0, start)}[[${title}]]${value.slice(cursor)}`;
  return { value: next, cursor: start + title.length + 4 };
}

export function openSlashQuery(value: string, cursor: number): string | null {
  if (isInsideFencedCode(value, cursor)) return null;
  const before = value.slice(0, cursor);
  const lineStart = before.lastIndexOf("\n") + 1;
  const line = before.slice(lineStart);
  const match = /^\/([^\n]*)$/.exec(line);
  if (!match) return null;
  if (line.includes(" ")) return null;
  return match[1] ?? "";
}

export type SlashItem = {
  id: string;
  label: string;
  hint: string;
  insert: string | (() => string);
};

export const SLASH_ITEMS: SlashItem[] = [
  { id: "h1", label: "Heading 1", hint: "Large", insert: "# " },
  { id: "h2", label: "Heading 2", hint: "Section", insert: "## " },
  { id: "h3", label: "Heading 3", hint: "Small", insert: "### " },
  { id: "bullet", label: "Bulleted list", hint: "List", insert: "- " },
  { id: "number", label: "Numbered list", hint: "1, 2, 3", insert: "1. " },
  { id: "todo", label: "To-do", hint: "Check", insert: "- [ ] " },
  { id: "quote", label: "Quote", hint: "Quote", insert: "> " },
  {
    id: "callout",
    label: "Callout",
    hint: "Note",
    insert: "> [!note]\n> ",
  },
  { id: "divider", label: "Divider", hint: "Line", insert: "---\n\n" },
  { id: "code", label: "Code block", hint: "```", insert: "```js\n\n```\n" },
  {
    id: "table",
    label: "Table",
    hint: "|",
    insert: "| Column | Column |\n| --- | --- |\n|  |  |\n",
  },
  {
    id: "toggle",
    label: "Toggle",
    hint: "details",
    insert: "<details>\n<summary>Title</summary>\n\nContent\n\n</details>\n",
  },
  { id: "link", label: "Link to page", hint: "[[", insert: "[[" },
  {
    id: "embed",
    label: "Embed a page",
    hint: "![[",
    insert: "![[",
  },
  {
    id: "seq",
    label: "Sequence diagram",
    hint: "seq",
    insert: "```seq\nAlice->Bob: Hello\nBob-->Alice: Hi\n```\n",
  },
  {
    id: "flow",
    label: "Flowchart",
    hint: "flow",
    insert: "```flow\nStart -> Work\nWork -> Done\n```\n",
  },
  {
    id: "math",
    label: "Math",
    hint: "$$",
    insert: "```math\nE = mc^2\n```\n",
  },
  { id: "mark", label: "Highlight", hint: "==", insert: "==highlight==" },
  {
    id: "today",
    label: "Today’s date",
    hint: "date",
    insert: () => format(new Date(), "MMMM d, yyyy"),
  },
  {
    id: "meeting",
    label: "Meeting notes",
    hint: "template",
    insert: "## Agenda\n\n- [ ] \n\n## Notes\n\n\n## Next\n\n- [ ] \n",
  },
  {
    id: "journal",
    label: "Journal",
    hint: "template",
    insert: "## What happened\n\n\n## What it meant\n\n\n## Keep\n\n- \n",
  },
];

export function applySlash(
  value: string,
  cursor: number,
  insert: string,
): { value: string; cursor: number } {
  const before = value.slice(0, cursor);
  const lineStart = before.lastIndexOf("\n") + 1;
  const next = `${value.slice(0, lineStart)}${insert}${value.slice(cursor)}`;
  const opening = /^```[^\n]*\n/.exec(insert);
  const cursorOffset =
    opening && insert.includes("\n```") ? opening[0].length : insert.length;
  return { value: next, cursor: lineStart + cursorOffset };
}

export function findAll(text: string, query: string, caseSensitive: boolean): number[] {
  if (!query) return [];
  const src = caseSensitive ? text : text.toLowerCase();
  const q = caseSensitive ? query : query.toLowerCase();
  const hits: number[] = [];
  let from = 0;
  while (from <= src.length - q.length) {
    const at = src.indexOf(q, from);
    if (at === -1) break;
    hits.push(at);
    from = at + Math.max(1, q.length);
  }
  return hits;
}

export function replaceAt(
  text: string,
  start: number,
  length: number,
  replacement: string,
): string {
  return text.slice(0, start) + replacement + text.slice(start + length);
}

export function replaceAllMatches(
  text: string,
  query: string,
  replacement: string,
  caseSensitive: boolean,
): string {
  if (!query) return text;
  if (caseSensitive) return text.split(query).join(replacement);
  const re = new RegExp(escapeRegExp(query), "gi");
  return text.replace(re, replacement);
}

export type ContentChunk = { type: "md"; value: string } | { type: "embed"; title: string };

export function splitEmbeds(content: string): ContentChunk[] {
  const re = /!\[\[([^\]|#]+)\]\]/g;
  const out: ContentChunk[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content))) {
    if (isInsideFencedCode(content, match.index)) continue;
    if (match.index > last) out.push({ type: "md", value: content.slice(last, match.index) });
    const title = match[1]?.trim();
    if (title) out.push({ type: "embed", title });
    last = match.index + match[0].length;
  }
  if (last < content.length) out.push({ type: "md", value: content.slice(last) });
  if (out.length === 0) out.push({ type: "md", value: content });
  return out;
}

export function openTab(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

export function closeTab(
  ids: string[],
  id: string,
  activeId: string | null,
): { ids: string[]; activeId: string | null } {
  const index = ids.indexOf(id);
  if (index === -1) return { ids, activeId };
  const next = ids.filter((item) => item !== id);
  if (activeId !== id) return { ids: next, activeId };
  const fallback = next[index] ?? next[index - 1] ?? next[0] ?? null;
  return { ids: next, activeId: fallback };
}

export function pruneTabs(ids: string[], noteIds: Set<string>, activeId: string | null): string[] {
  const kept = ids.filter((id) => noteIds.has(id));
  if (activeId && noteIds.has(activeId) && !kept.includes(activeId)) kept.push(activeId);
  return kept;
}

type ListLine = {
  indent: string;
  marker: string;
  task: string | null;
  rest: string;
  prefixLength: number;
};

function parseListLine(line: string): ListLine | null {
  const match = /^(\s*)([-*+]|\d+[.)])\s+(?:(\[[ xX]\])\s*)?(.*)$/.exec(line);
  if (!match) return null;
  const indent = match[1] ?? "";
  const marker = match[2] ?? "";
  const task = match[3] ?? null;
  const rest = match[4] ?? "";
  return {
    indent,
    marker,
    task,
    rest,
    prefixLength: line.length - rest.length,
  };
}

function nextListMarker(marker: string): string {
  const numbered = /^(\d+)([.)])$/.exec(marker);
  if (!numbered) return marker;
  return `${Number(numbered[1]) + 1}${numbered[2]}`;
}

function listPrefix(indent: string, marker: string, task: string | null): string {
  return task ? `${indent}${marker} [ ] ` : `${indent}${marker} `;
}

/** Continue a bullet, number, or to-do on Enter. Empty item exits or outdents. */
export function continueList(
  value: string,
  cursor: number,
): { value: string; cursor: number } | null {
  if (isInsideFencedCode(value, cursor)) return null;
  const lineStart = value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
  const newline = value.indexOf("\n", lineStart);
  const lineEnd = newline === -1 ? value.length : newline;
  if (cursor < lineStart || cursor > lineEnd) return null;
  const parsed = parseListLine(value.slice(lineStart, lineEnd));
  if (!parsed) return null;
  if (cursor < lineStart + parsed.prefixLength) return null;

  if (parsed.rest.length === 0) {
    if (parsed.indent.length >= 2) {
      const kept = listPrefix(parsed.indent.slice(2), parsed.marker, parsed.task);
      return {
        value: value.slice(0, lineStart) + kept + value.slice(lineEnd),
        cursor: lineStart + kept.length,
      };
    }
    return {
      value: value.slice(0, lineStart) + value.slice(lineEnd),
      cursor: lineStart,
    };
  }

  const prefix = listPrefix(parsed.indent, nextListMarker(parsed.marker), parsed.task);
  const insert = `\n${prefix}`;
  return {
    value: value.slice(0, cursor) + insert + value.slice(cursor),
    cursor: cursor + insert.length,
  };
}

/** Turn the current line into a bullet or to-do, or remove that marker. */
export function applyLineMarker(
  value: string,
  cursor: number,
  kind: "bullet" | "todo",
): { value: string; cursor: number } {
  const marker = kind === "todo" ? "- [ ] " : "- ";
  const lineStart = value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
  const newline = value.indexOf("\n", lineStart);
  const lineEnd = newline === -1 ? value.length : newline;
  const line = value.slice(lineStart, lineEnd);
  const parsed = parseListLine(line);
  let nextLine: string;
  if (parsed) {
    const same =
      (kind === "todo" && parsed.task !== null) ||
      (kind === "bullet" && parsed.task === null && parsed.marker === "-");
    nextLine = same
      ? `${parsed.indent}${parsed.rest}`
      : `${parsed.indent}${marker}${parsed.rest}`;
  } else {
    const indent = /^(\s*)/.exec(line)?.[1] ?? "";
    nextLine = `${indent}${marker}${line.slice(indent.length)}`;
  }
  return {
    value: value.slice(0, lineStart) + nextLine + value.slice(lineEnd),
    cursor: lineStart + nextLine.length,
  };
}

export type VisualLine = {
  kind: "text" | "bullet" | "todo" | "number" | "image" | "heading" | "quote" | "callout" | "divider" | "embed";
  indent: string;
  marker: string;
  checked: boolean;
  text: string;
  raw: string;
};

function textVisualLine(raw: string): VisualLine {
  return { kind: "text", indent: "", marker: "", checked: false, text: raw, raw };
}

const DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*$/;

/** A single-line markdown image the writing page can show. Other lines stay text. */
export function imageSource(raw: string): { alt: string; src: string } | null {
  const match = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(raw.trim());
  if (!match) return null;
  const alt = match[1] ?? "";
  const src = match[2] ?? "";
  if (DATA_IMAGE.test(src)) return { alt, src };
  if (/^https:\/\/[\w\-./%?&=:+#~]+$/.test(src) && src.length < 2000) return { alt, src };
  return null;
}

export function insertImageLine(
  value: string,
  cursor: number,
  dataUrl: string,
): { value: string; cursor: number } {
  if (!DATA_IMAGE.test(dataUrl)) throw new Error("unsupported image");
  const block = `![](${dataUrl})`;
  const at = Math.max(0, Math.min(cursor, value.length));
  const lineStart = value.lastIndexOf("\n", Math.max(0, at - 1)) + 1;
  const newline = value.indexOf("\n", lineStart);
  const lineEnd = newline === -1 ? value.length : newline;
  const line = value.slice(lineStart, lineEnd);
  if (line.trim() === "") {
    const rest = lineEnd < value.length ? value.slice(lineEnd + 1) : "";
    const next = `${value.slice(0, lineStart)}${block}\n${rest}`;
    return { value: next, cursor: lineStart + block.length + 1 };
  }
  const rest = lineEnd < value.length ? value.slice(lineEnd + 1) : "";
  const next = `${value.slice(0, lineEnd)}\n${block}\n${rest}`;
  return { value: next, cursor: lineEnd + 1 + block.length + 1 };
}

export function insertSpokenText(
  value: string,
  cursor: number,
  transcript: string,
): { value: string; cursor: number } {
  const spoken = transcript.replace(/\s+/g, " ").trim();
  if (!spoken) return { value, cursor };
  const at = Math.max(0, Math.min(cursor, value.length));
  const needsSpace = at > 0 && !/\s$/.test(value.slice(0, at));
  const chunk = `${needsSpace ? " " : ""}${spoken}`;
  return {
    value: value.slice(0, at) + chunk + value.slice(at),
    cursor: at + chunk.length,
  };
}

/** Split a note into lines. List markers stay in `raw`; `text` is what the user sees. */
export function splitVisualLines(value: string): VisualLine[] {
  let fence = false;
  return value.split("\n").map((raw) => {
    const fenceLine = /^ {0,3}```/.test(raw);
    if (fence || fenceLine) {
      if (fenceLine) fence = !fence;
      return textVisualLine(raw);
    }
    const image = imageSource(raw);
    if (image) {
      return { kind: "image", indent: "", marker: "", checked: false, text: image.alt, raw };
    }
    const embed = /^!\[\[([^\]|#]+)\]\]\s*$/.exec(raw);
    if (embed) {
      return { kind: "embed", indent: "", marker: "", checked: false, text: embed[1]?.trim() ?? "", raw };
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(raw.trim())) {
      return { kind: "divider", indent: "", marker: "", checked: false, text: "", raw };
    }
    const heading = /^(#{1,6})[ \t]+(.*)$/.exec(raw);
    if (heading) {
      return {
        kind: "heading",
        indent: "",
        marker: heading[1] ?? "#",
        checked: false,
        text: heading[2] ?? "",
        raw,
      };
    }
    const callout = /^>\s*\[!(note|tip|warn)\][ \t]*(.*)$/i.exec(raw);
    if (callout) {
      return {
        kind: "callout",
        indent: "",
        marker: (callout[1] ?? "note").toLowerCase(),
        checked: false,
        text: callout[2] ?? "",
        raw,
      };
    }
    const quote = /^>[ \t]?(.*)$/.exec(raw);
    if (quote) {
      return { kind: "quote", indent: "", marker: ">", checked: false, text: quote[1] ?? "", raw };
    }
    const parsed = parseListLine(raw);
    if (!parsed) return textVisualLine(raw);
    if (parsed.task) {
      return {
        kind: "todo",
        indent: parsed.indent,
        marker: parsed.marker,
        checked: /x/i.test(parsed.task),
        text: parsed.rest,
        raw,
      };
    }
    if (/^\d/.test(parsed.marker)) {
      return {
        kind: "number",
        indent: parsed.indent,
        marker: parsed.marker,
        checked: false,
        text: parsed.rest,
        raw,
      };
    }
    return {
      kind: "bullet",
      indent: parsed.indent,
      marker: parsed.marker,
      checked: false,
      text: parsed.rest,
      raw,
    };
  });
}

export function joinVisualLines(lines: VisualLine[]): string {
  return lines.map((line) => line.raw).join("\n");
}

export function withVisualText(line: VisualLine, text: string): VisualLine {
  if (line.kind === "text") return { ...line, text, raw: text };
  const prefix = line.raw.slice(0, line.raw.length - line.text.length);
  return { ...line, text, raw: prefix + text };
}

export function markdownOffsetFromLines(lines: VisualLine[], line: number, column: number): number {
  let pos = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.raw;
    if (i === line) {
      const textStart = raw.length - lines[i]!.text.length;
      return pos + textStart + Math.max(0, Math.min(column, lines[i]!.text.length));
    }
    pos += raw.length + 1;
  }
  return Math.max(0, pos - 1);
}

export function visualCaret(value: string, offset: number): { line: number; column: number } {
  const lines = splitVisualLines(value);
  let pos = 0;
  const clamped = Math.max(0, Math.min(offset, value.length));
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.raw;
    const end = pos + raw.length;
    if (clamped <= end || i === lines.length - 1) {
      const textStart = pos + (raw.length - lines[i]!.text.length);
      const column = Math.max(0, Math.min(lines[i]!.text.length, clamped - textStart));
      return { line: i, column };
    }
    pos = end + 1;
  }
  return { line: 0, column: 0 };
}

export function noteMatchesFilter(note: Note, filter: LibraryFilter): boolean {
  switch (filter.type) {
    case "all":
      return true;
    case "pinned":
      return note.pinned;
    case "unfiled":
      return note.folderId === null;
    case "daily":
      return isDailyTitle(note.title);
    case "folder":
      return note.folderId === filter.id;
    case "tag":
      return extractTags(note.content).includes(filter.tag);
  }
}

export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

export function filterLabel(filter: LibraryFilter, folders: { id: string; name: string }[]): string {
  switch (filter.type) {
    case "all":
      return "All Notes";
    case "pinned":
      return "Pinned";
    case "unfiled":
      return "Unfiled";
    case "daily":
      return "Today";
    case "folder":
      return folders.find((folder) => folder.id === filter.id)?.name ?? "Folder";
    case "tag":
      return `#${filter.tag}`;
  }
}

export function buildGraph(notes: Note[]): {
  nodes: {
    id: string;
    title: string;
    pinned: boolean;
    folderId: string | null;
    kind: Note["kind"];
    words: number;
    links: number;
  }[];
  edges: { from: string; to: string }[];
} {
  const nodes = notes.map((note) => ({
    id: note.id,
    title: displayTitle(note.title),
    pinned: note.pinned,
    folderId: note.folderId,
    kind: note.kind,
    words:
      note.kind === "canvas"
        ? Math.max(8, note.drawing.strokes.length * 6)
        : wordCount(note.content),
    links: 0,
  }));
  const byTitle = new Map(nodes.map((node) => [node.title.toLowerCase(), node.id]));
  const edges: { from: string; to: string }[] = [];
  const seen = new Set<string>();
  const degree = new Map<string, number>();
  for (const note of notes) {
    for (const link of extractWikiLinks(note.content)) {
      const to = byTitle.get(link.toLowerCase());
      if (!to || to === note.id) continue;
      const key = `${note.id}>${to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: note.id, to });
      degree.set(note.id, (degree.get(note.id) ?? 0) + 1);
      degree.set(to, (degree.get(to) ?? 0) + 1);
    }
  }
  for (const node of nodes) {
    node.links = degree.get(node.id) ?? 0;
  }
  return { nodes, edges };
}
