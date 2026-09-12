import assert from "node:assert/strict";
import { test } from "node:test";
import { nextRevision, observeRevision, resetRevisionForTests, revisionAfter } from "./revision.ts";

test("two nextRevision calls in the same millisecond are not identical", () => {
  resetRevisionForTests(0);
  const a = nextRevision(1_700_000_000_000);
  const b = nextRevision(1_700_000_000_000);
  const c = nextRevision(1_700_000_000_000);
  assert.equal(a, 1_700_000_000_000);
  assert.equal(b, a + 1);
  assert.equal(c, a + 2);
  assert.notEqual(a, b);
});

test("revisionAfter is always strictly greater than the previous version", () => {
  resetRevisionForTests(0);
  const first = nextRevision(50);
  const second = revisionAfter(first, 50);
  const third = revisionAfter(second, 50);
  assert.equal(first, 50);
  assert.ok(second > first);
  assert.ok(third > second);
});

test("observeRevision prevents the clock from going backwards after hydrate", () => {
  resetRevisionForTests(0);
  observeRevision(900);
  const next = nextRevision(10);
  assert.ok(next > 900);
});
