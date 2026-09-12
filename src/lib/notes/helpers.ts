import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import type { LibraryFilter, Note } from "./types";

export function displayTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : "Untitled";
}

export function snippet(content: string, max = 88): string {
  const text = content
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
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
  { id: "h1", label: "Heading 1", hint: "#", insert: "# " },
  { id: "h2", label: "Heading 2", hint: "##", insert: "## " },
  { id: "h3", label: "Heading 3", hint: "###", insert: "### " },
  { id: "bullet", label: "Bulleted list", hint: "-", insert: "- " },
  { id: "number", label: "Numbered list", hint: "1.", insert: "1. " },
  { id: "todo", label: "To-do", hint: "[]", insert: "- [ ] " },
  { id: "quote", label: "Quote", hint: ">", insert: "> " },
  {
    id: "callout",
    label: "Callout",
    hint: "note",
    insert: "> [!note]\n> ",
  },
  { id: "divider", label: "Divider", hint: "---", insert: "---\n\n" },
  { id: "code", label: "Code block", hint: "```", insert: "```\n\n```\n" },
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
  return { value: next, cursor: lineStart + insert.length };
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
    if (match.index > last) out.push({ type: "md", value: content.slice(last, match.index) });
    const title = match[1]?.trim();
    if (title) out.push({ type: "embed", title });
    last = match.index + match[0].length;
  }
  if (last < content.length) out.push({ type: "md", value: content.slice(last) });
  if (out.length === 0) out.push({ type: "md", value: content });
  return out;
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
  nodes: { id: string; title: string; pinned: boolean }[];
  edges: { from: string; to: string }[];
} {
  const nodes = notes.map((note) => ({
    id: note.id,
    title: displayTitle(note.title),
    pinned: note.pinned,
  }));
  const byTitle = new Map(nodes.map((node) => [node.title.toLowerCase(), node.id]));
  const edges: { from: string; to: string }[] = [];
  const seen = new Set<string>();
  for (const note of notes) {
    for (const link of extractWikiLinks(note.content)) {
      const to = byTitle.get(link.toLowerCase());
      if (!to || to === note.id) continue;
      const key = note.id < to ? `${note.id}>${to}` : `${to}>${note.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: note.id, to });
    }
  }
  return { nodes, edges };
}
