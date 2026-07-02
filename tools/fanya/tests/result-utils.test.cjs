const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  appendAlreadyCompletedReviews,
  appendSkippedReviews,
  createResultFile,
  extractCompletedStudentKeys,
  extractHandledStudentKeys,
  extractSkippedStudentKeys,
} = require("../scripts/result-utils.cjs");
const { appendStudentReview, loadRecord } = require("../scripts/record-store.cjs");

const SUMMARY = String.fromCodePoint(0x4f5c, 0x4e1a, 0x8bc4, 0x4ef7, 0x6c47, 0x603b);

test("createResultFile creates a structured result record", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-result-record-"));
  const resultPath = createResultFile({
    outputDir: root,
    courseName: "Course A",
    assignmentName: "Assignment A",
    rubricPath: "rubrics/Course A/Assignment A-rubric.cjs",
    date: "2026-06-23",
  });

  assert.equal(resultPath, path.join(root, `Course A-${SUMMARY}-2026-06-23.cjs`));
  assert.equal(loadRecord(resultPath).kind, "fanya_result");
});

test("extractHandledStudentKeys and extractSkippedStudentKeys read structured result records", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-result-state-"));
  const resultPath = createResultFile({
    outputDir: root,
    courseName: "Course A",
    assignmentName: "Assignment A",
    date: "2026-06-23",
  });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment A",
    review: { studentName: "Reviewed", studentKey: "20230001", status: "reviewed", suggestedScore: 88 },
  });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment A",
    review: { studentName: "Manual", studentKey: "20230002", status: "manual_review", statusReason: "cannot_open_attachment" },
  });
  appendSkippedReviews({
    resultPath,
    assignmentName: "Assignment A",
    students: [{ studentName: "Skipped", studentKey: "20230003" }],
  });

  assert.deepEqual(extractHandledStudentKeys({ resultPath, assignmentName: "Assignment A" }), [
    "20230001",
    "20230002",
    "20230003",
  ]);
  assert.deepEqual(extractCompletedStudentKeys({ resultPath, assignmentName: "Assignment A" }), [
    "20230001",
    "20230002",
  ]);
  assert.deepEqual(extractSkippedStudentKeys({ resultPath, assignmentName: "Assignment A" }), ["20230003"]);
});

test("appendSkippedReviews does not overwrite existing reviews", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-result-no-overwrite-"));
  const resultPath = createResultFile({
    outputDir: root,
    courseName: "Course A",
    assignmentName: "Assignment A",
    date: "2026-06-23",
  });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment A",
    review: { studentName: "Reviewed", studentKey: "20230001", status: "reviewed", suggestedScore: 88, comment: "keep" },
  });

  const result = appendSkippedReviews({
    resultPath,
    assignmentName: "Assignment A",
    students: [{ studentName: "Reviewed", studentKey: "20230001" }],
  });

  assert.deepEqual(result.appended, []);
  const record = loadRecord(resultPath);
  assert.equal(record.assignments[0].reviews[0].status, "reviewed");
  assert.equal(record.assignments[0].reviews[0].comment, "keep");
});

test("appendAlreadyCompletedReviews records web completed students without marking them skipped", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-result-web-completed-"));
  const resultPath = createResultFile({
    outputDir: root,
    courseName: "Course A",
    assignmentName: "Assignment A",
    date: "2026-06-23",
  });

  const result = appendAlreadyCompletedReviews({
    resultPath,
    assignmentName: "Assignment A",
    students: [{ studentName: "Done", studentKey: "20230004" }],
  });

  const review = loadRecord(resultPath).assignments[0].reviews[0];
  assert.deepEqual(result.appended, ["20230004"]);
  assert.equal(review.status, "reviewed");
  assert.equal(review.statusReason, "already_completed_on_website");
  assert.equal(review.suggestedScore, null);
});
