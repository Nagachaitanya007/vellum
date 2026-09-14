import assert from "node:assert/strict";
import { test } from "node:test";
import { applySlash, isInsideFencedCode, openSlashQuery, openWikiQuery, splitEmbeds } from "./helpers.ts";
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
