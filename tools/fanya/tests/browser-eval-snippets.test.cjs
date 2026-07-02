const assert = require("node:assert/strict");
const test = require("node:test");

const { getSnippet } = require("../scripts/browser-eval-snippets.cjs");

test("browser eval snippets are short enough for inline browser-act eval", () => {
  for (const name of ["page-state-lite", "assignment-review-summary", "student-detail-summary", "roster-page"]) {
    const script = getSnippet(name);
    assert.match(script, /^\(\(\)=>/);
    assert.ok(script.length < 2200, `${name} should stay short`);
  }
});

test("page-state-lite returns navigation hints without roster fields", () => {
  const script = getSnippet("page-state-lite");
  assert.match(script, /hints/);
  assert.match(script, /portal/);
  assert.doesNotMatch(script, /studentName|studentKey|rawText/);
});

test("assignment and detail snippets are aggregate only", () => {
  assert.match(getSnippet("assignment-review-summary"), /pendingVisible/);
  assert.match(getSnippet("student-detail-summary"), /attachmentLikeCount/);
  assert.doesNotMatch(getSnippet("assignment-review-summary"), /studentName|studentKey|rawText/);
  assert.doesNotMatch(getSnippet("student-detail-summary"), /studentName|studentKey|rawText/);
});

test("roster-page returns structured rows and pagination", () => {
  const script = getSnippet("roster-page");
  assert.ok(script.length < 1200, `roster-page is too long: ${script.length}`);
  assert.match(script, /rows/);
  assert.match(script, /pagination/);
  assert.match(script, /cells/);
  assert.match(script, /links/);
  assert.match(script, /workAnswerId|review-work/);
});

test("unknown snippet reports available names", () => {
  assert.throws(() => getSnippet("missing"), /Available snippets/);
});
