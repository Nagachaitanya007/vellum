import assert from "node:assert/strict";
import { test } from "node:test";
import { applySlash, continueList, imageSource, insertImageLine, insertSpokenText, isInsideFencedCode, openSlashQuery, openWikiQuery, splitEmbeds, splitVisualLines, visualCaret, withVisualText } from "./helpers.ts";
import { renderMarkdown } from "./markdown.ts";

test("fenced javascript blocks keep language, indentation, and line breaks", () => {
  const source = ["intro", "", "```js", "function hi() {", "  return 1;", "}", "```", ""].join("\n");
  const html = renderMarkdown(source);
  assert.match(html, /class="language-js"/);
  assert.match(html, /md-code-lang/);
  assert.match(html, />js</);
  assert.match(html, /function hi\(\)/);
  assert.match(html, /  return 1;/);
  assert.doesNotMatch(html, /<p>function hi/);
});

test("tsx and python fences are accepted as language identifiers", () => {
  const tsx = renderMarkdown("```tsx\nexport const X = () => <div />\n```");
  const py = renderMarkdown("```python\ndef add(a, b):\n    return a + b\n```");
  assert.match(tsx, /language-tsx/);
  assert.match(py, /language-python/);
  assert.match(py, /    return a \+ b/);
});

test("wiki and slash suggestions stay off inside a fenced code block", () => {
  const value = "```js\n[[Page\n/code\n";
  const at = value.length;
  assert.equal(isInsideFencedCode(value, at), true);
  assert.equal(openWikiQuery(value, at), null);
  assert.equal(openSlashQuery(value, at), null);
});

test("wiki and slash suggestions return after a closed fence", () => {
  const value = "```js\nconst x = 1;\n```\n[[Wel";
  const at = value.length;
  assert.equal(isInsideFencedCode(value, at), false);
  assert.equal(openWikiQuery(value, at), "Wel");
});

test("slash still opens on a normal line", () => {
  assert.equal(openSlashQuery("/code", 5), "code");
  assert.equal(openWikiQuery("See [[Wel", 9), "Wel");
});

test("slash-inserting a code block places the cursor inside the fence", () => {
  const result = applySlash("/code", 5, "```js\n\n```\n");
  assert.equal(result.value, "```js\n\n```\n");
  assert.equal(result.cursor, "```js\n".length);
});

test("embeds inside fenced code are not split out of the markdown chunk", () => {
  const content = "```md\n![[Other]]\n```\n\nHello";
  const chunks = splitEmbeds(content);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0]?.type, "md");
  assert.match(chunks[0]?.value ?? "", /!\[\[Other\]\]/);
});

test("enter continues a bullet and a to-do", () => {
  const bullet = continueList("- milk", "- milk".length);
  assert.equal(bullet?.value, "- milk\n- ");
  assert.equal(bullet?.cursor, "- milk\n- ".length);
  const todo = continueList("- [ ] milk", "- [ ] milk".length);
  assert.equal(todo?.value, "- [ ] milk\n- [ ] ");
  const numbered = continueList("1. one", "1. one".length);
  assert.equal(numbered?.value, "1. one\n2. ");
});

test("enter on an empty list item leaves the list", () => {
  const exited = continueList("- milk\n- ", "- milk\n- ".length);
  assert.equal(exited?.value, "- milk\n");
  assert.equal(exited?.cursor, "- milk\n".length);
});

test("enter inside a code fence does not continue a list", () => {
  const value = "```\n- stay\n";
  assert.equal(continueList(value, value.length), null);
});

test("list lines show words only, not the dash or checkbox marks", () => {
  const lines = splitVisualLines("- milk\n- [ ] eggs\n- [x] bread\n1. one");
  assert.equal(lines[0]?.kind, "bullet");
  assert.equal(lines[0]?.text, "milk");
  assert.equal(lines[1]?.kind, "todo");
  assert.equal(lines[1]?.text, "eggs");
  assert.equal(lines[1]?.checked, false);
  assert.equal(lines[2]?.checked, true);
  assert.equal(lines[3]?.kind, "number");
  assert.equal(lines[3]?.text, "one");
  assert.equal(lines.map((line) => line.raw).join("\n"), "- milk\n- [ ] eggs\n- [x] bread\n1. one");
});

test("editing list text keeps the marker hidden", () => {
  const [line] = splitVisualLines("- [ ] eggs");
  assert.ok(line);
  const next = withVisualText(line, "eggs and toast");
  assert.equal(next.text, "eggs and toast");
  assert.equal(next.raw, "- [ ] eggs and toast");
  assert.equal(visualCaret("- [ ] eggs", "- [ ] ".length).column, 0);
});

test("a pasted image is its own picture line, not a wall of text", () => {
  const url = "data:image/jpeg;base64,aGVsbG8=";
  const inserted = insertImageLine("Hello", "Hello".length, url);
  assert.match(inserted.value, /^Hello\n!\[\]\(data:image\/jpeg;base64,aGVsbG8=\)\n$/);
  const lines = splitVisualLines(inserted.value);
  assert.equal(lines[1]?.kind, "image");
  assert.equal(lines[1]?.text, "");
  assert.equal(imageSource(lines[1]?.raw ?? "")?.src, url);
  assert.equal(imageSource("![](javascript:alert(1))"), null);
});

test("voice typing inserts words at the cursor with a separating space", () => {
  const first = insertSpokenText("Buy", 3, " milk");
  assert.equal(first.value, "Buy milk");
  const next = insertSpokenText(first.value, first.cursor, "  and eggs  ");
  assert.equal(next.value, "Buy milk and eggs");
  assert.equal(next.cursor, next.value.length);
});
