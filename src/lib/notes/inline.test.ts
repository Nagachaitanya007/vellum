import assert from "node:assert/strict";
import test from "node:test";
import { inlineToHtml, inlineToMarkdown, parseInline, visibleInline } from "./inline.ts";

test("bold, links, and code hide their markdown marks", () => {
  assert.equal(visibleInline("**On the desk**"), "On the desk");
  assert.equal(visibleInline("A [[How linking works]] page"), "A How linking works page");
  assert.equal(visibleInline("[[Markdown, in brief|the short guide]]"), "the short guide");
  assert.equal(visibleInline("Use `code` and ~~no~~ and ==yes=="), "Use code and no and yes");
  assert.equal(visibleInline("#writing"), "writing");
  assert.equal(inlineToMarkdown(parseInline("**On the desk**")), "**On the desk**");
  assert.equal(inlineToMarkdown(parseInline("[[Hello|there]]")), "[[Hello|there]]");
  assert.match(inlineToHtml("**On the desk**"), /^<strong>On the desk<\/strong>$/);
  assert.doesNotMatch(inlineToHtml("**On the desk**"), /\*\*/);
});
