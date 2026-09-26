import { Check } from "lucide-react";
import {
  useLayoutEffect,
  useRef,
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";
import {
  imageSource,
  joinVisualLines,
  markdownOffsetFromLines,
  splitVisualLines,
  visualCaret,
  withVisualText,
  type VisualLine,
} from "@/lib/notes/helpers";
import { inlineToHtml, placeCaret, readInline } from "@/lib/notes/inline";
import { cn } from "@/lib/utils";

function textLine(raw: string): VisualLine {
  return { kind: "text", indent: "", marker: "", checked: false, text: raw, raw };
}

function quoteLine(text: string): VisualLine {
  return { kind: "quote", indent: "", marker: ">", checked: false, text, raw: `> ${text}` };
}

function lineTextClass(line: VisualLine): string {
  if (line.kind !== "heading") return "text-lg";
  if (line.marker.length <= 1) return "text-3xl font-medium";
  if (line.marker.length === 2) return "text-2xl font-medium";
  return "text-xl font-medium";
}

function listLine(
  kind: "bullet" | "todo" | "number",
  indent: string,
  marker: string,
  checked: boolean,
  text: string,
): VisualLine {
  const raw =
    kind === "todo"
      ? `${indent}${marker || "-"} [${checked ? "x" : " "}] ${text}`
      : `${indent}${marker || "-"} ${text}`;
  return { kind, indent, marker: marker || "-", checked, text, raw };
}

function renumber(lines: VisualLine[], around: number): VisualLine[] {
  const origin = lines[around];
  if (!origin || origin.kind !== "number") return lines;
  let start = around;
  while (start > 0 && lines[start - 1]?.kind === "number" && lines[start - 1]?.indent === origin.indent) {
    start -= 1;
  }
  const out = lines.slice();
  let n = 1;
  for (let i = start; i < out.length; i++) {
    const line = out[i];
    if (!line || line.kind !== "number" || line.indent !== origin.indent) break;
    const punct = line.marker.endsWith(")") ? ")" : ".";
    const marker = `${n}${punct}`;
    out[i] = { ...line, marker, raw: `${line.indent}${marker} ${line.text}` };
    n += 1;
  }
  return out;
}

function codeSpans(lines: VisualLine[]) {
  const covered = new Set<number>();
  const ranges: Array<{ start: number; end: number; lang: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (covered.has(i) || lines[i]?.kind !== "text") continue;
    const open = /^ {0,3}```([^\s`]*)$/.exec(lines[i]!.raw.trim());
    if (!open) continue;
    let end = i + 1;
    while (end < lines.length && !/^ {0,3}```\s*$/.test(lines[end]!.raw.trim())) end += 1;
    if (end >= lines.length) continue;
    ranges.push({ start: i, end, lang: open[1] ?? "" });
    for (let k = i; k <= end; k++) covered.add(k);
  }
  return { covered, ranges };
}

export function VisualNote({
  value,
  focusTick,
  focusAt,
  onChange,
  onCursor,
  onKeyDown,
  editorRef,
  placeholder,
  onPasteImages,
}: {
  value: string;
  focusTick: number;
  focusAt: number;
  onChange: (value: string, cursor: number) => void;
  onCursor: (cursor: number) => void;
  onKeyDown: (event: ReactKeyboardEvent, start: number, end: number) => boolean;
  editorRef: RefObject<HTMLElement | null>;
  placeholder: string;
  onPasteImages: (files: File[]) => void;
}) {
  const lines = splitVisualLines(value);
  const { covered, ranges } = codeSpans(lines);
  const rows = useRef<Array<HTMLElement | null>>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const pending = useRef<{ line: number; column: number } | null>(null);
  const seenTick = useRef(focusTick);
  const composing = useRef(false);

  function commit(next: VisualLine[], line: number, column: number) {
    pending.current = { line, column };
    const joined = joinVisualLines(next);
    onChange(joined, markdownOffsetFromLines(next, line, column));
  }

  function lineIndex(node: Node | null): number | null {
    const element = node instanceof Element ? node : node?.parentElement;
    const host = element?.closest<HTMLElement>("[data-vellum-line]");
    if (!host) return null;
    const index = Number(host.dataset.vellumLine);
    return Number.isNaN(index) ? null : index;
  }

  function focusLine(line: number, column: number) {
    const el = rows.current[line];
    if (!el) return;
    placeCaret(el, column);
    editorRef.current = rootRef.current;
  }

  useLayoutEffect(() => {
    const focus = pending.current;
    if (!focus) return;
    pending.current = null;
    focusLine(focus.line, focus.column);
  });

  useLayoutEffect(() => {
    if (focusTick === seenTick.current) return;
    seenTick.current = focusTick;
    const pos = visualCaret(value, focusAt);
    focusLine(pos.line, pos.column);
  }, [focusTick, focusAt, value, editorRef]);

  useLayoutEffect(() => {
    if (rootRef.current) editorRef.current = rootRef.current;
  }, [editorRef]);

  function onEnter(index: number, caret: number) {
    const line = lines[index];
    if (!line) return;
    if (line.kind === "text" || line.kind === "heading" || line.kind === "callout") {
      const next = [
        ...lines.slice(0, index),
        withVisualText(line, line.text.slice(0, caret)),
        textLine(line.text.slice(caret)),
        ...lines.slice(index + 1),
      ];
      commit(next, index + 1, 0);
      return;
    }
    if (line.kind === "image" || line.kind === "divider" || line.kind === "embed") {
      const next = [...lines.slice(0, index), line, textLine(""), ...lines.slice(index + 1)];
      commit(next, index + 1, 0);
      return;
    }
    if (line.kind === "quote") {
      if (line.text.length === 0) {
        const next = [...lines.slice(0, index), textLine(""), ...lines.slice(index + 1)];
        commit(next, index, 0);
        return;
      }
      const next = [
        ...lines.slice(0, index),
        withVisualText(line, line.text.slice(0, caret)),
        quoteLine(line.text.slice(caret)),
        ...lines.slice(index + 1),
      ];
      commit(next, index + 1, 0);
      return;
    }
    if (line.text.length === 0) {
      if (line.indent.length >= 2) {
        const outdented = listLine(line.kind, line.indent.slice(2), line.marker, line.checked, "");
        const next = [...lines.slice(0, index), outdented, ...lines.slice(index + 1)];
        commit(line.kind === "number" ? renumber(next, index) : next, index, 0);
        return;
      }
      const next = [...lines.slice(0, index), textLine(""), ...lines.slice(index + 1)];
      commit(next, index, 0);
      return;
    }
    const before = withVisualText(line, line.text.slice(0, caret));
    const marker =
      line.kind === "number"
        ? line.marker.replace(/^(\d+)/, (n) => String(Number(n) + 1))
        : line.marker;
    const after = listLine(line.kind, line.indent, marker, false, line.text.slice(caret));
    let next = [...lines.slice(0, index), before, after, ...lines.slice(index + 1)];
    if (line.kind === "number") next = renumber(next, index + 1);
    commit(next, index + 1, 0);
  }

  function onBackspace(index: number) {
    const line = lines[index];
    if (!line) return;
    if (line.kind === "image") {
      const next = lines.filter((_, i) => i !== index);
      const safe = next.length > 0 ? next : [textLine("")];
      const focus = Math.min(index, safe.length - 1);
      commit(safe, focus, safe[focus]?.text.length ?? 0);
      return;
    }
    if (line.kind !== "text") {
      const next = [...lines.slice(0, index), textLine(line.text), ...lines.slice(index + 1)];
      commit(next, index, 0);
      return;
    }
    if (index === 0) return;
    const prev = lines[index - 1]!;
    const merged = withVisualText(prev, prev.text + line.text);
    const next = [...lines.slice(0, index - 1), merged, ...lines.slice(index + 1)];
    commit(next, index - 1, prev.text.length);
  }

  function onTab(index: number, shift: boolean) {
    const line = lines[index];
    if (!line || line.kind === "text") {
      const current = lines[index];
      if (!current) return;
      const caret = rows.current[index] ? readInline(rows.current[index]!).anchor : current.text.length;
      const text = `${current.text.slice(0, caret)}  ${current.text.slice(caret)}`;
      const next = [...lines.slice(0, index), withVisualText(current, text), ...lines.slice(index + 1)];
      commit(next, index, caret + 2);
      return;
    }
    if (shift && line.indent.length < 2) return;
    const indent = shift ? line.indent.slice(2) : `${line.indent}  `;
    const raw = indent + line.raw.slice(line.indent.length);
    const next = [...lines.slice(0, index), { ...line, indent, raw }, ...lines.slice(index + 1)];
    const column = rows.current[index] ? readInline(rows.current[index]!).anchor : line.text.length;
    commit(next, index, column);
  }

  function pastedFiles(event: ReactClipboardEvent): File[] {
    const files: File[] = [];
    for (const item of event.clipboardData?.items ?? []) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    return files;
  }

  function onPaste(event: ReactClipboardEvent) {
    const files = pastedFiles(event);
    if (files.length > 0) {
      event.preventDefault();
      onPasteImages(files);
      return;
    }
    const text = event.clipboardData?.getData("text/plain");
    if (text == null) return;
    event.preventDefault();
    const index = lineIndex(document.getSelection()?.anchorNode ?? null);
    if (index === null) return;
    const line = lines[index];
    if (!line) return;
    const column = rows.current[index] ? readInline(rows.current[index]!).anchor : line.text.length;
    const pieces = text.replaceAll("\r\n", "\n").split("\n");
    const before = line.text.slice(0, column);
    const after = line.text.slice(column);
    pieces[0] = `${before}${pieces[0] ?? ""}`;
    pieces[pieces.length - 1] = `${pieces[pieces.length - 1] ?? ""}${after}`;
    const inserted = pieces.map((piece, pieceIndex) =>
      pieceIndex === 0 ? withVisualText(line, piece) : textLine(piece),
    );
    const next = [...lines.slice(0, index), ...inserted, ...lines.slice(index + 1)];
    commit(next, index + inserted.length - 1, (pieces[pieces.length - 1] ?? "").length - after.length);
  }

  function syncFromDom() {
    if (composing.current) return;
    const index = lineIndex(document.getSelection()?.anchorNode ?? null);
    let changed = false;
    const next = lines.map((line, lineNo) => {
      const el = rows.current[lineNo];
      if (!el || el instanceof HTMLTextAreaElement) return line;
      const read = readInline(el);
      if (read.text === line.text) return line;
      changed = true;
      return withVisualText(line, read.text);
    });
    if (!changed || index === null) return;
    const column = rows.current[index] ? readInline(rows.current[index]!).anchor : 0;
    onChange(joinVisualLines(next), markdownOffsetFromLines(next, index, column));
    pending.current = { line: index, column };
    onCursor(markdownOffsetFromLines(next, index, column));
  }

  function onRootKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) return;
    const index = lineIndex(document.getSelection()?.anchorNode ?? null);
    if (index === null) return;
    const host = rows.current[index];
    if (!host || host instanceof HTMLTextAreaElement) return;
    const read = readInline(host);
    const start = markdownOffsetFromLines(lines, index, Math.min(read.anchor, read.focus));
    const end = markdownOffsetFromLines(lines, index, Math.max(read.anchor, read.focus));
    if (onKeyDown(event, start, end)) return;
    const collapsed = read.anchor === read.focus;
    if (event.key === "Enter" && !event.shiftKey && !(event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onEnter(index, collapsed ? read.anchor : Math.min(read.anchor, read.focus));
      return;
    }
    if (
      event.key === "Backspace" &&
      collapsed &&
      read.anchor === 0 &&
      !(event.metaKey || event.ctrlKey)
    ) {
      const line = lines[index];
      if (line?.kind === "text" && index === 0) return;
      event.preventDefault();
      onBackspace(index);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      onTab(index, event.shiftKey);
    }
  }

  function writeCode(start: number, end: number, text: string) {
    const inner = text.split("\n").map((raw) => textLine(raw));
    const next = [...lines.slice(0, start + 1), ...inner, ...lines.slice(end)];
    onChange(joinVisualLines(next), 0);
  }

  return (
    <div
      ref={rootRef}
      className="note-writing flex flex-col pb-16 outline-none"
      aria-label="Note body"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      onPaste={onPaste}
      onInput={syncFromDom}
      onKeyDown={onRootKeyDown}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
        syncFromDom();
      }}
      onMouseUp={() => {
        const index = lineIndex(document.getSelection()?.anchorNode ?? null);
        const host = index === null ? null : rows.current[index];
        if (index === null || !host || host instanceof HTMLTextAreaElement) return;
        onCursor(markdownOffsetFromLines(lines, index, readInline(host).anchor));
      }}
    >
      {lines.map((line, index) => {
        const code = ranges.find((range) => range.start === index);
        if (covered.has(index) && !code) return null;
        if (code) {
          const body = lines.slice(code.start + 1, code.end).map((item) => item.raw).join("\n");
          return (
            <div key={index} className="my-2 rounded-md border border-paper-line bg-paper-hover" contentEditable={false}>
              {code.lang ? <div className="px-3 pt-2 font-mono text-xs text-paper-muted">{code.lang}</div> : null}
              <textarea
                data-vellum-line={code.start + 1}
                ref={(el) => {
                  rows.current[code.start + 1] = el;
                }}
                value={body}
                rows={Math.max(2, body.split("\n").length)}
                spellCheck={false}
                aria-label="Code"
                className="min-h-11 w-full resize-none bg-transparent px-3 py-2 font-mono text-sm leading-relaxed text-paper-fg outline-none"
                onChange={(event) => writeCode(code.start, code.end, event.target.value)}
                onKeyDown={(event) => {
                  const el = event.currentTarget;
                  if (event.key === "ArrowUp" && el.selectionStart === 0) {
                    event.preventDefault();
                    focusLine(Math.max(0, code.start - 1), 0);
                  }
                  if (event.key === "ArrowDown" && el.selectionStart === el.value.length) {
                    event.preventDefault();
                    focusLine(Math.min(lines.length - 1, code.end + 1), 0);
                  }
                }}
              />
            </div>
          );
        }
        return (
        <div
          key={index}
          className={cn(
            "flex min-h-11 w-full items-start",
            line.kind === "callout" && "my-1 rounded-md border border-paper-line bg-paper-hover px-3",
          )}
          style={{ paddingLeft: line.kind === "callout" ? undefined : `${Math.floor(line.indent.length / 2) * 1.25}rem` }}
        >
          {line.kind === "divider" ? (
            <button
              type="button"
              contentEditable={false}
              aria-label="Divider"
              className="my-2 flex h-11 w-full items-center"
              onKeyDown={(event) => {
                if (event.key === "Backspace" || event.key === "Delete") {
                  event.preventDefault();
                  onBackspace(index);
                }
              }}
            >
              <span className="block h-px w-full bg-paper-line" />
            </button>
          ) : line.kind === "image" ? (
            <figure className="my-2 w-full" contentEditable={false}>
              <img
                src={imageSource(line.raw)?.src}
                alt={line.text || "Pasted image"}
                className="max-h-80 max-w-full rounded-md border border-paper-line"
              />
              <button
                type="button"
                className="mt-1 h-11 px-1 text-sm text-paper-muted hover:text-paper-fg"
                onClick={() => onBackspace(index)}
              >
                Remove image
              </button>
            </figure>
          ) : line.kind === "embed" ? (
            <div className="my-2 w-full rounded-md border border-paper-line px-3 py-3" contentEditable={false}>
              {line.text}
            </div>
          ) : (
          <>
          {line.kind === "quote" ? (
            <span className="mr-3 mt-2 mb-2 w-0.5 shrink-0 self-stretch rounded-full bg-paper-muted" aria-hidden contentEditable={false} />
          ) : null}
          {line.kind === "callout" ? (
            <span className="mt-3 mr-3 shrink-0 text-xs font-medium uppercase tracking-wide text-paper-muted" contentEditable={false}>
              {line.marker}
            </span>
          ) : null}
          {line.kind === "bullet" ? (
            <span className="mt-[1.15rem] mr-3 size-1.5 shrink-0 rounded-full bg-paper-fg" aria-hidden contentEditable={false} />
          ) : null}
          {line.kind === "number" ? (
            <span className="mt-2 mr-3 w-6 shrink-0 text-right font-sans text-sm text-paper-muted tabular-nums" contentEditable={false}>
              {line.marker}
            </span>
          ) : null}
          {line.kind === "todo" ? (
            <button
              type="button"
              contentEditable={false}
              role="checkbox"
              aria-checked={line.checked}
              aria-label={line.checked ? "Completed" : "Not done"}
              className="mt-1 mr-1 inline-flex size-11 shrink-0 items-center justify-center"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const checked = !line.checked;
                const raw = line.raw.replace(/\[[ xX]\]/, checked ? "[x]" : "[ ]");
                const next = [...lines.slice(0, index), { ...line, checked, raw }, ...lines.slice(index + 1)];
                const column = rows.current[index] ? readInline(rows.current[index]!).anchor : line.text.length;
                commit(next, index, column);
              }}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-[4px] border",
                  line.checked
                    ? "border-paper-fg bg-paper-fg text-paper"
                    : "border-paper-muted bg-transparent",
                )}
              >
                {line.checked ? <Check className="size-3.5" strokeWidth={2.5} /> : null}
              </span>
            </button>
          ) : null}
          <div
            data-vellum-line={index}
            data-placeholder={
              line.kind === "heading"
                ? "Heading"
                : line.kind === "quote"
                  ? "Quote"
                  : line.kind === "callout"
                    ? "Write a note"
                    : index === 0 && lines.length === 1 && line.kind === "text"
                      ? placeholder
                      : ""
            }
            ref={(el) => {
              rows.current[index] = el;
            }}
            dangerouslySetInnerHTML={{ __html: inlineToHtml(line.text) }}
            aria-label={line.kind === "heading" ? "Heading" : line.kind === "text" ? "Note text" : "List item"}
            className={cn(
              "min-h-11 w-full flex-1 whitespace-pre-wrap py-2 font-serif leading-writing outline-none",
              lineTextClass(line),
              line.checked ? "text-paper-muted line-through" : "text-paper-fg",
            )}
          />
          </>
          )}
        </div>
        );
      })}
    </div>
  );
}
