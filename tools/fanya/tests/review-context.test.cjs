const assert = require("node:assert/strict");
const test = require("node:test");

const { looseContextName, normalizeContextName, validateReviewContext } = require("../scripts/review-context.cjs");

test("normalizeContextName ignores whitespace and bracket spacing", () => {
  assert.equal(normalizeContextName(" [ COURSE-001 ] Example Course "), "[course-001]examplecourse");
});

test("looseContextName ignores whitespace and punctuation for fuzzy matching", () => {
  assert.equal(looseContextName("Assignment 4：Visual Story"), "assignment4visualstory");
  assert.equal(looseContextName("Assignment 4 - Visual Story"), "assignment4visualstory");
});

test("validateReviewContext allows matching course and assignment names", () => {
  const result = validateReviewContext(
    { courseName: "[COURSE-001] Example Course", assignmentName: "Assignment 4：Visual Story" },
    { courseName: "[COURSE-001]Example Course", assignmentName: "Assignment 4：Visual Story" },
  );

  assert.equal(result.ok, true);
  assert.equal(result.action, "continue");
  assert.deepEqual(result.mismatches, []);
});

test("validateReviewContext asks to sync names for punctuation-only differences", () => {
  const result = validateReviewContext(
    { courseName: "[COURSE-001] Example Course", assignmentName: "Assignment 4 Visual Story" },
    { courseName: "[COURSE-001]Example Course", assignmentName: "Assignment 4：Visual Story" },
  );

  assert.equal(result.ok, true);
  assert.equal(result.action, "sync_names");
  assert.deepEqual(result.syncNames, [
    {
      field: "assignmentName",
      expected: "Assignment 4 Visual Story",
      actual: "Assignment 4：Visual Story",
      reason: "format_only",
    },
  ]);
});

test("validateReviewContext blocks when course name does not match", () => {
  const result = validateReviewContext(
    { courseName: "Course A", assignmentName: "Assignment A" },
    { courseName: "Course B", assignmentName: "Assignment A" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.action, "manual_select_required");
  assert.deepEqual(result.mismatches, [
    { field: "courseName", expected: "Course A", actual: "Course B" },
  ]);
});

test("validateReviewContext blocks when assignment name does not match", () => {
  const result = validateReviewContext(
    { courseName: "Course A", assignmentName: "Assignment A" },
    { courseName: "Course A", assignmentName: "Assignment B" },
  );

  assert.equal(result.ok, false);
  assert.equal(result.action, "manual_select_required");
  assert.deepEqual(result.mismatches, [
    { field: "assignmentName", expected: "Assignment A", actual: "Assignment B" },
  ]);
});

test("validateReviewContext reports both course and assignment mismatches", () => {
  const result = validateReviewContext(
    { courseName: "Course A", assignmentName: "Assignment A" },
    { courseName: "Course B", assignmentName: "Assignment B" },
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.mismatches.map((item) => item.field), ["courseName", "assignmentName"]);
});
