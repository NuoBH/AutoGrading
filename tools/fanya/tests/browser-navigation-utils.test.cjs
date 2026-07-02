const assert = require("node:assert/strict");
const test = require("node:test");

const {
  classifyPageState,
  normalizeNavText,
  rankByNeedle,
  retryDecision,
  requireUserChoice,
} = require("../scripts/browser-navigation-utils.cjs");

test("normalizeNavText ignores whitespace and punctuation", () => {
  assert.equal(normalizeNavText(" Course:  Assignment (A) "), "courseassignmenta");
});

test("rankByNeedle ranks exact and contained matches", () => {
  const candidates = [
    { text: "Other Course", href: "https://example.test/other" },
    { text: "Digital Effects Basics", href: "https://example.test/course" },
  ];
  const ranked = rankByNeedle(candidates, "Digital Effects Basics");
  assert.equal(ranked[0].text, "Digital Effects Basics");
  assert.equal(ranked[0].matchScore, 1);
});

test("requireUserChoice is true for duplicate top scores", () => {
  const ranked = [
    { text: "Course A", matchScore: 1 },
    { text: "Course A", matchScore: 1 },
  ];
  assert.equal(requireUserChoice(ranked), true);
});

test("retryDecision refreshes blank or loading pages before failing", () => {
  assert.deepEqual(retryDecision({ state: "blank", attempt: 1, maxAttempts: 2 }), {
    action: "refresh",
    reason: "blank_or_loading",
  });
  assert.deepEqual(retryDecision({ state: "blank", attempt: 2, maxAttempts: 2 }), {
    action: "ask_user",
    reason: "blank_or_loading_after_retry",
  });
});

test("classifyPageState recognizes login, blank, and course list states", () => {
  assert.equal(classifyPageState({ url: "https://school.example.edu.cn/", text: "login password" }), "login_required");
  assert.equal(classifyPageState({ url: "https://example.test", text: "personal space course list" }), "course_list");
  assert.equal(classifyPageState({ url: "https://example.test", text: "" }), "blank");
});
