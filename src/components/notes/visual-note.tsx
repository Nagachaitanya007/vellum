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

function fit(el: HTMLTextAreaElement) {
  el.style.height = "0px";
  el.style.height = `${el.scrollHeight}px`;
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
  onKeyDown: (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
    start: number,
    end: number,
  ) => boolean;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
  onPasteImages: (files: File[]) => void;
}) {
  const lines = splitVisualLines(value);
  const rows = useRef<Array<HTMLTextAreaElement | null>>([]);
  const pending = useRef<{ line: number; column: number } | null>(null);
  const seenTick = useRef(focusTick);

  function commit(next: VisualLine[], line: number, column: number) {
    pending.current = { line, column };
    const joined = joinVisualLines(next);
    onChange(joined, markdownOffsetFromLines(next, line, column));
  }

  useLayoutEffect(() => {
    rows.current.forEach((el) => {
      if (el) fit(el);
    });
    const focus = pending.current;
    if (!focus) return;
    pending.current = null;
    const el = rows.current[focus.line];
    if (!el) return;
    el.focus();
    const column = Math.max(0, Math.min(focus.column, el.value.length));
    el.setSelectionRange(column, column);
    editorRef.current = el;
  }, [value, editorRef]);

  useLayoutEffect(() => {
    if (focusTick === seenTick.current) return;
    seenTick.current = focusTick;
    const pos = visualCaret(value, focusAt);
    const el = rows.current[pos.line];
    if (!el) return;
    el.focus();
    el.setSelectionRange(pos.column, pos.column);
    editorRef.current = el;
  }, [focusTick, focusAt, value, editorRef]);

  useLayoutEffect(() => {
    const first = rows.current[0];
    if (first) editorRef.current = first;
  }, [editorRef]);

  function report(index: number, el: HTMLTextAreaElement) {
    editorRef.current = el;
    onCursor(markdownOffsetFromLines(lines, index, el.selectionStart));
  }

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
    if (line.kind === "image" || line.kind === "divider") {
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
      const el = rows.current[index];
      const caret = el?.selectionStart ?? current.text.length;
      const text = `${current.text.slice(0, caret)}  ${current.text.slice(caret)}`;
      const next = [...lines.slice(0, index), withVisualText(current, text), ...lines.slice(index + 1)];
      commit(next, index, caret + 2);
      return;
    }
    if (shift && line.indent.length < 2) return;
    const indent = shift ? line.indent.slice(2) : `${line.indent}  `;
    const raw = indent + line.raw.slice(line.indent.length);
    const next = [...lines.slice(0, index), { ...line, indent, raw }, ...lines.slice(index + 1)];
    const column = rows.current[index]?.selectionStart ?? line.text.length;
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
    if (files.length === 0) return;
    event.preventDefault();
    onPasteImages(files);
  }

  return (
    <div className="flex flex-col pb-16" aria-label="Note body" onPaste={onPaste}>
      {lines.map((line, index) => (
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
            <figure className="my-2 w-full">
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
          ) : (
          <>
          {line.kind === "quote" ? (
            <span className="mr-3 mt-2 mb-2 w-0.5 shrink-0 self-stretch rounded-full bg-paper-muted" aria-hidden />
          ) : null}
          {line.kind === "callout" ? (
            <span className="mt-3 mr-3 shrink-0 text-xs font-medium uppercase tracking-wide text-paper-muted">
              {line.marker}
            </span>
          ) : null}
          {line.kind === "bullet" ? (
            <span className="mt-[1.15rem] mr-3 size-1.5 shrink-0 rounded-full bg-paper-fg" aria-hidden />
          ) : null}
          {line.kind === "number" ? (
            <span className="mt-2 mr-3 w-6 shrink-0 text-right font-sans text-sm text-paper-muted tabular-nums">
              {line.marker}
            </span>
          ) : null}
          {line.kind === "todo" ? (
            <button
              type="button"
              role="checkbox"
              aria-checked={line.checked}
              aria-label={line.checked ? "Completed" : "Not done"}
              className="mt-1 mr-1 inline-flex size-11 shrink-0 items-center justify-center"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const checked = !line.checked;
                const raw = line.raw.replace(/\[[ xX]\]/, checked ? "[x]" : "[ ]");
                const next = [...lines.slice(0, index), { ...line, checked, raw }, ...lines.slice(index + 1)];
                const column = rows.current[index]?.selectionStart ?? line.text.length;
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
          <textarea
            data-vellum-line={index}
            ref={(el) => {
              rows.current[index] = el;
              if (index === 0 && el && !editorRef.current) editorRef.current = el;
            }}
            value={line.text}
            rows={1}
            placeholder={
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
            aria-label={line.kind === "heading" ? "Heading" : line.kind === "text" ? "Note text" : "List item"}
            spellCheck
            className={cn(
              "min-h-11 w-full flex-1 resize-none overflow-hidden bg-transparent py-2 font-serif leading-writing outline-none",
              lineTextClass(line),
              line.checked ? "text-paper-muted line-through" : "text-paper-fg",
              "placeholder:text-paper-subtle",
            )}
            onChange={(event) => {
              const text = event.target.value;
              const next = [...lines.slice(0, index), withVisualText(line, text), ...lines.slice(index + 1)];
              onChange(joinVisualLines(next), markdownOffsetFromLines(next, index, event.target.selectionStart));
              onCursor(markdownOffsetFromLines(next, index, event.target.selectionStart));
            }}
            onFocus={(event) => report(index, event.currentTarget)}
            onClick={(event) => report(index, event.currentTarget)}
            onKeyUp={(event) => report(index, event.currentTarget)}
            onSelect={(event) => report(index, event.currentTarget)}
            onKeyDown={(event) => {
              const el = event.currentTarget;
              const start = markdownOffsetFromLines(lines, index, el.selectionStart);
              const end = markdownOffsetFromLines(lines, index, el.selectionEnd);
              if (onKeyDown(event, start, end)) return;
              if (event.key === "Enter" && !event.shiftKey && !(event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                onEnter(index, el.selectionStart);
                return;
              }
              if (
                event.key === "Backspace" &&
                el.selectionStart === 0 &&
                el.selectionEnd === 0 &&
                !(event.metaKey || event.ctrlKey)
              ) {
                if (line.kind === "text" && index === 0) return;
                event.preventDefault();
                onBackspace(index);
                return;
              }
              if (event.key === "Tab") {
                event.preventDefault();
                onTab(index, event.shiftKey);
              }
            }}
            onPaste={onPaste}
          />
          </>
          )}
        </div>
      ))}
    </div>
  );
}
