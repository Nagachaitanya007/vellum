export type InlineToken =
  | { type: "text"; text: string }
  | { type: "bold" | "italic" | "code" | "strike" | "mark"; text: string }
  | { type: "wiki"; title: string; label: string }
  | { type: "tag"; tag: string };

const RULES: Array<{ type: InlineToken["type"]; re: RegExp }> = [
  { type: "wiki", re: /^\[\[([^\]|#]+)\|([^\]]+)\]\]/ },
  { type: "wiki", re: /^\[\[([^\]|#]+)\]\]/ },
  { type: "code", re: /^`([^`\n]+)`/ },
  { type: "bold", re: /^\*\*([^*\n]+)\*\*/ },
  { type: "strike", re: /^~~([^~\n]+)~~/ },
  { type: "mark", re: /^==([^=\n]+)==/ },
  { type: "italic", re: /^\*([^*\n]+)\*/ },
  { type: "italic", re: /^_([^_\n]+)_/ },
  { type: "tag", re: /^#([A-Za-z][\w-]*)/ },
];

export function parseInline(source: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    let matched = false;
    for (const rule of RULES) {
      const found = rule.re.exec(rest);
      if (!found) continue;
      if (rule.type === "wiki") {
        const title = (found[1] ?? "").trim();
        const label = (found[2] ?? title).trim();
        tokens.push({ type: "wiki", title, label });
      } else if (rule.type === "tag") {
        tokens.push({ type: "tag", tag: found[1] ?? "" });
      } else {
        tokens.push({ type: rule.type, text: found[1] ?? "" });
      }
      i += found[0].length;
      matched = true;
      break;
    }
    if (matched) continue;
    const last = tokens[tokens.length - 1];
    if (last?.type === "text") last.text += source[i];
    else tokens.push({ type: "text", text: source[i] ?? "" });
    i += 1;
  }
  return tokens;
}

export function inlineToMarkdown(tokens: InlineToken[]): string {
  return tokens
    .map((token) => {
      if (token.type === "text") return token.text;
      if (token.type === "bold") return `**${token.text}**`;
      if (token.type === "italic") return `*${token.text}*`;
      if (token.type === "code") return `\`${token.text}\``;
      if (token.type === "strike") return `~~${token.text}~~`;
      if (token.type === "mark") return `==${token.text}==`;
      if (token.type === "tag") return `#${token.tag}`;
      if (token.type === "wiki") {
        return token.label === token.title ? `[[${token.title}]]` : `[[${token.title}|${token.label}]]`;
      }
      return token.text;
    })
    .join("");
}

export function visibleInline(source: string): string {
  return parseInline(source)
    .map((token) => {
      if (token.type === "text" || token.type === "bold" || token.type === "italic" || token.type === "code" || token.type === "strike" || token.type === "mark") {
        return token.text;
      }
      if (token.type === "tag") return token.tag;
      if (token.type === "wiki") return token.label;
      return token.text;
    })
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&" + "amp;")
    .replaceAll("<", "&" + "lt;")
    .replaceAll(">", "&" + "gt;")
    .replaceAll('"', "&" + "quot;");
}

export function inlineToHtml(source: string): string {
  return parseInline(source)
    .map((token) => {
      if (token.type === "text") return escapeHtml(token.text);
      if (token.type === "bold") return `<strong>${escapeHtml(token.text)}</strong>`;
      if (token.type === "italic") return `<em>${escapeHtml(token.text)}</em>`;
      if (token.type === "code") return `<code>${escapeHtml(token.text)}</code>`;
      if (token.type === "strike") return `<s>${escapeHtml(token.text)}</s>`;
      if (token.type === "mark") return `<mark>${escapeHtml(token.text)}</mark>`;
      if (token.type === "tag") {
        return `<span class="hashtag" data-tag="${escapeHtml(token.tag)}">${escapeHtml(token.tag)}</span>`;
      }
      if (token.type === "wiki") {
        const alias = token.label !== token.title;
        return `<a class="wiki-link" data-wiki="${escapeHtml(token.title)}" data-alias="${alias ? "1" : "0"}" href="#">${escapeHtml(token.label)}</a>`;
      }
      return escapeHtml(token.text);
    })
    .join("");
}

function wrapLength(tag: string): number {
  if (tag === "STRONG" || tag === "S" || tag === "MARK") return 2;
  if (tag === "EM" || tag === "CODE") return 1;
  return 0;
}

function marker(tag: string, text: string): string {
  if (tag === "STRONG") return `**${text}**`;
  if (tag === "EM") return `*${text}*`;
  if (tag === "CODE") return `\`${text}\``;
  if (tag === "S") return `~~${text}~~`;
  if (tag === "MARK") return `==${text}==`;
  return text;
}

type Caret = { node: Node; offset: number };

/** Read the markdown stored in a formatted line, plus the caret inside that markdown. */
export function readInline(root: HTMLElement): { text: string; anchor: number; focus: number } {
  const selection = typeof document === "undefined" ? null : document.getSelection();
  let text = "";
  let anchor = 0;
  let focus = 0;
  let anchorSet = false;
  let focusSet = false;

  function note(node: Node, start: number, end: number) {
    if (!selection) return;
    if (!anchorSet && selection.anchorNode === node) {
      const at = Math.max(start, Math.min(end, start + selection.anchorOffset));
      anchor = text.length - (end - start) + (at - start);
      anchorSet = true;
    }
    if (!focusSet && selection.focusNode === node) {
      const at = Math.max(start, Math.min(end, start + selection.focusOffset));
      focus = text.length - (end - start) + (at - start);
      focusSet = true;
    }
  }

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? "";
      text += value;
      note(node, 0, value.length);
      return;
    }
    if (!(node instanceof HTMLElement) || node.tagName === "BR") return;
    const wiki = node.dataset.wiki;
    if (wiki) {
      const label = node.textContent ?? "";
      const md = node.dataset.alias === "1" ? `[[${wiki}|${label}]]` : `[[${wiki}]]`;
      const start = text.length;
      text += md;
      if (selection && (selection.anchorNode === node || node.contains(selection.anchorNode))) {
        anchor = text.length;
        anchorSet = true;
      }
      if (selection && (selection.focusNode === node || node.contains(selection.focusNode))) {
        focus = text.length;
        focusSet = true;
      }
      if (!anchorSet && selection?.anchorNode === node) anchor = start;
      return;
    }
    if (node.dataset.tag) {
      const md = `#${node.dataset.tag}`;
      text += md;
      if (selection && node.contains(selection.anchorNode)) {
        anchor = text.length;
        anchorSet = true;
      }
      if (selection && node.contains(selection.focusNode)) {
        focus = text.length;
        focusSet = true;
      }
      return;
    }
    const pad = wrapLength(node.tagName);
    if (pad) text += marker(node.tagName, "").slice(0, pad);
    node.childNodes.forEach(walk);
    if (pad) text += marker(node.tagName, "").slice(-pad);
  }

  root.childNodes.forEach(walk);
  if (!anchorSet) anchor = text.length;
  if (!focusSet) focus = anchor;
  return { text, anchor, focus };
}

function placeAt(node: Node, offset: number): Caret {
  return { node, offset };
}

/** Put the caret at a markdown offset inside a line that was rendered with inlineToHtml. */
export function placeCaret(root: HTMLElement, markdownIndex: number) {
  if (root instanceof HTMLTextAreaElement || root instanceof HTMLInputElement) {
    const column = Math.max(0, Math.min(markdownIndex, root.value.length));
    root.focus();
    root.setSelectionRange(column, column);
    return;
  }
  const selection = document.getSelection();
  if (!selection) return;
  const found: { caret: Caret | null } = { caret: null };
  let remaining = Math.max(0, markdownIndex);

  function walk(node: Node): boolean {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? "";
      if (remaining <= value.length) {
        found.caret = placeAt(node, remaining);
        return true;
      }
      remaining -= value.length;
      return false;
    }
    if (!(node instanceof HTMLElement) || node.tagName === "BR") return false;
    if (node.dataset.wiki) {
      const label = node.textContent ?? "";
      const md = node.dataset.alias === "1" ? `[[${node.dataset.wiki}|${label}]]` : `[[${node.dataset.wiki}]]`;
      if (remaining <= md.length) {
        const text = node.firstChild ?? node;
        found.caret = placeAt(text, text.nodeType === Node.TEXT_NODE ? (text.textContent ?? "").length : 0);
        return true;
      }
      remaining -= md.length;
      return false;
    }
    if (node.dataset.tag) {
      const md = `#${node.dataset.tag}`;
      if (remaining <= md.length) {
        const text = node.firstChild ?? node;
        const visible = text.textContent ?? "";
        found.caret = placeAt(text, text.nodeType === Node.TEXT_NODE ? Math.min(Math.max(0, remaining - 1), visible.length) : 0);
        return true;
      }
      remaining -= md.length;
      return false;
    }
    const pad = wrapLength(node.tagName);
    if (pad && remaining <= pad) {
      found.caret = placeAt(node, 0);
      return true;
    }
    if (pad) remaining -= pad;
    for (const child of node.childNodes) {
      if (walk(child)) return true;
    }
    if (pad && remaining <= pad) {
      found.caret = placeAt(node, node.childNodes.length);
      return true;
    }
    if (pad) remaining -= pad;
    return false;
  }

  for (const child of root.childNodes) {
    if (walk(child)) break;
  }
  const range = document.createRange();
  if (found.caret) range.setStart(found.caret.node, found.caret.offset);
  else {
    range.selectNodeContents(root);
    range.collapse(false);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
