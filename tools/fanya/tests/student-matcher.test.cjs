const assert = require("node:assert/strict");
const test = require("node:test");

const { resolveStudentKeys } = require("../scripts/student-matcher.cjs");

test("resolveStudentKeys matches explicit keys and student names", () => {
  const result = resolveStudentKeys([
    { studentKey: "20230001", studentName: "Alpha" },
    { studentKey: "20230002", studentName: "Beta Student" },
  ], {
    studentKeys: ["20230001"],
    studentNames: ["Beta"],
  });

  assert.deepEqual(result.matchedKeys, ["20230001", "20230002"]);
  assert.deepEqual(result.unmatchedNames, []);
});

test("resolveStudentKeys reports unmatched names without guessing", () => {
  const result = resolveStudentKeys([
    { studentKey: "20230001", studentName: "Alpha" },
  ], {
    studentNames: ["Missing"],
  });

  assert.deepEqual(result.matchedKeys, []);
  assert.deepEqual(result.unmatchedNames, ["missing"]);
});

test("resolveStudentKeys does not partially match unrelated wrong names", () => {
  const result = resolveStudentKeys([
    { studentKey: "20230001", studentName: "Alpha" },
    { studentKey: "20230002", studentName: "Beta" },
  ], {
    studentNames: ["Gamma"],
  });

  assert.deepEqual(result.matchedKeys, []);
  assert.deepEqual(result.unmatchedNames, ["gamma"]);
});

test("resolveStudentKeys matches names with extra spaces between characters", () => {
  const result = resolveStudentKeys([
    { studentKey: "999000001", studentName: "示例甲" },
    { studentKey: "999000002", studentName: "示例乙" },
  ], {
    studentNames: [" 示  例   甲 ", "示 例乙"],
  });

  assert.deepEqual(result.matchedKeys, ["999000001", "999000002"]);
  assert.deepEqual(result.unmatchedNames, []);
});

test("resolveStudentKeys matches spaced names against standardized student directories", () => {
  const result = resolveStudentKeys([
    { studentKey: "999000001", studentDir: "tmp/work/students/999000001-示例甲" },
  ], {
    studentNames: ["示 例 甲"],
  });

  assert.deepEqual(result.matchedKeys, ["999000001"]);
  assert.deepEqual(result.unmatchedNames, []);
});
