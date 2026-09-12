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

export function renderSequenceHtml(source: string): string {
  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const actors: string[] = [];
  const rows: { from: string; to: string; message: string; dashed: boolean }[] = [];
  for (const line of lines) {
    const match = /^(.+?)\s*(-{1,2}>)\s*(.+?)\s*:\s*(.+)$/.exec(line);
    if (!match) continue;
    const from = match[1]!.trim();
    const to = match[3]!.trim();
    const dashed = match[2] === "-->";
    const message = match[4]!.trim();
    if (!actors.includes(from)) actors.push(from);
    if (!actors.includes(to)) actors.push(to);
    rows.push({ from, to, message, dashed });
  }
  if (actors.length === 0) {
    return `<pre><code>${escapeHtml(source)}</code></pre>`;
  }
  const cols = actors
    .map((actor) => `<span class="md-seq-actor">${escapeHtml(actor)}</span>`)
    .join("");
  const body = rows
    .map((row) => {
      const arrow = row.dashed ? "dashed" : "solid";
      return `<div class="md-seq-row" data-arrow="${arrow}"><span class="md-seq-from">${escapeHtml(row.from)}</span><span class="md-seq-msg">${escapeHtml(row.message)}</span><span class="md-seq-to">${escapeHtml(row.to)}</span></div>`;
    })
    .join("");
  return `<div class="md-seq" role="img" aria-label="Sequence diagram"><div class="md-seq-actors">${cols}</div>${body}</div>`;
}

export function renderFlowHtml(source: string): string {
  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const nodes: string[] = [];
  const edges: { from: string; to: string }[] = [];
  for (const line of lines) {
    const match = /^(.+?)\s*->\s*(.+)$/.exec(line);
    if (!match) {
      if (!nodes.includes(line)) nodes.push(line);
      continue;
    }
    const from = match[1]!.trim();
    const to = match[2]!.trim();
    if (!nodes.includes(from)) nodes.push(from);
    if (!nodes.includes(to)) nodes.push(to);
    edges.push({ from, to });
  }
  if (nodes.length === 0) {
    return `<pre><code>${escapeHtml(source)}</code></pre>`;
  }
  const parts = nodes.map((node, index) => {
    const outgoing = edges.filter((edge) => edge.from === node);
    const label = outgoing.length
      ? outgoing.map((edge) => escapeHtml(edge.to)).join(", ")
      : "";
    const arrow =
      index < nodes.length - 1 ? `<div class="md-flow-arrow" aria-hidden="true"></div>` : "";
    return `<div class="md-flow-node">${escapeHtml(node)}${label && outgoing.length ? `<span class="md-flow-next">→ ${label}</span>` : ""}</div>${arrow}`;
  });
  return `<div class="md-flow" role="img" aria-label="Flowchart">${parts.join("")}</div>`;
}

export function renderMathHtml(source: string): string {
  return `<div class="md-math">${escapeHtml(source.trim())}</div>`;
}
