import { marked, type Tokens } from "marked";
import DOMPurify from "dompurify";

const AMP = "&" + "amp;";
const LT = "&" + "lt;";
const GT = "&" + "gt;";
const QUOT = "&" + "quot;";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (ch) => {
    if (ch === "&") return AMP;
    if (ch === "<") return LT;
    if (ch === ">") return GT;
    return QUOT;
  });
}

function unescapeHtml(value: string): string {
  return value.replaceAll(QUOT, '"').replaceAll(LT, "<").replaceAll(GT, ">").replaceAll(AMP, "&");
}

const wikiExtension = {
  name: "wikilink",
  level: "inline" as const,
  start(src: string) {
    return src.indexOf("[[");
  },
  tokenizer(src: string) {
    if (src.startsWith("![[")) return;
    const match = /^\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/.exec(src);
    if (!match) return;
    return {
      type: "wikilink",
      raw: match[0],
      href: match[1].trim(),
      text: (match[2] ?? match[1]).trim(),
    };
  },
  renderer(token: Tokens.Generic) {
    const href = String(token.href ?? "");
    const text = String(token.text ?? href);
    return `<a class="wiki-link" href="#wiki" data-wiki="${escapeHtml(href)}">${escapeHtml(text)}</a>`;
  },
};

const tagExtension = {
  name: "hashtag",
  level: "inline" as const,
  start(src: string) {
    const match = src.match(/(^|[\s(])#[A-Za-z]/);
    return match ? (match.index ?? 0) + match[1].length : undefined;
  },
  tokenizer(src: string) {
    const match = /^#([A-Za-z][\w-]*)/.exec(src);
    if (!match) return;
    return {
      type: "hashtag",
      raw: match[0],
      tag: match[1],
    };
  },
  renderer(token: Tokens.Generic) {
    const tag = String(token.tag ?? "");
    return `<a class="hashtag" href="#tag" data-tag="${escapeHtml(tag.toLowerCase())}">#${escapeHtml(tag)}</a>`;
  },
};

marked.use({
  gfm: true,
  breaks: true,
  extensions: [wikiExtension, tagExtension],
});

function withCallouts(html: string): string {
  return html.replace(
    /<blockquote>\s*<p>\[!(note|tip|warn)\][ \t]*(.*?)<\/p>/gi,
    (_full, kind: string, rest: string) => {
      const label = rest.trim() || kind;
      return `<blockquote class="callout" data-callout="${kind.toLowerCase()}"><p class="callout-title">${label}</p>`;
    },
  );
}

export function renderMarkdown(source: string, knownTitles: string[] = []): string {
  if (!source.trim()) return "";
  const raw = marked.parse(source, { async: false }) as string;
  const titles = new Set(knownTitles.map((title) => title.trim().toLowerCase()));
  let task = 0;
  const withTasks = raw.replace(/<input ([^>]*type="checkbox"[^>]*)>/g, (_full, attrs: string) => {
    const checked = /\bchecked\b/.test(attrs);
    const index = task++;
    return `<input type="checkbox" data-task="${index}"${checked ? " checked" : ""}>`;
  });
  const withWiki = withTasks.replace(
    /class="wiki-link" href="#wiki" data-wiki="([^"]+)"/g,
    (full, encoded: string) => {
      const title = unescapeHtml(encoded).toLowerCase();
      if (titles.has(title)) return full;
      return full.replace('class="wiki-link"', 'class="wiki-link is-missing"');
    },
  );
  const withBoxes = withCallouts(withWiki);
  if (typeof window === "undefined") return withBoxes;
  return DOMPurify.sanitize(withBoxes, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["input", "details", "summary"],
    ADD_ATTR: [
      "target",
      "rel",
      "data-wiki",
      "data-tag",
      "data-task",
      "data-callout",
      "checked",
      "open",
    ],
  });
}
