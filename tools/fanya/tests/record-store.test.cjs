const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  appendStudentReview,
  createResultRecordFile,
  createRubricRecordFile,
  defaultReviewPriority,
  extractHandledStudentKeys,
  extractSkippedStudentKeys,
  loadRecord,
  syncRecordContext,
} = require("../scripts/record-store.cjs");

const SUMMARY = String.fromCodePoint(0x4f5c, 0x4e1a, 0x8bc4, 0x4ef7, 0x6c47, 0x603b);

test("result record stores reviews as data and never overwrites existing students", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-record-"));
  const resultPath = createResultRecordFile({
    outputDir: root,
    courseName: "Course A",
    assignmentName: "Assignment A",
    rubricPath: "rubrics/Course A/Assignment A-rubric.cjs",
    date: "2026-06-23",
  });

  assert.equal(resultPath, path.join(root, `Course A-${SUMMARY}-2026-06-23.cjs`));
  assert.equal(loadRecord(resultPath).kind, "fanya_result");

  const first = appendStudentReview({
    resultPath,
    assignmentName: "Assignment A",
    review: {
      studentName: "Student A",
      studentKey: "20230001",
      submissionSummary: "video",
      suggestedScore: 88,
      comment: "Original comment",
      status: "reviewed",
      statusReason: "",
    },
  });
  const duplicate = appendStudentReview({
    resultPath,
    assignmentName: "Assignment A",
    review: {
      studentName: "Student A",
      studentKey: "20230001",
      submissionSummary: "-",
      suggestedScore: 70,
      comment: "Should not overwrite",
      status: "skipped",
      statusReason: "user_skipped",
    },
  });

  assert.equal(first.appended, true);
  assert.equal(duplicate.appended, false);
  const record = loadRecord(resultPath);
  assert.equal(record.assignments[0].reviews.length, 1);
  assert.equal(record.assignments[0].reviews[0].comment, "Original comment");
});

test("result record separates handled students from skipped students", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-record-state-"));
  const resultPath = createResultRecordFile({
    outputDir: root,
    courseName: "Course A",
    assignmentName: "Assignment A",
    date: "2026-06-23",
  });

  appendStudentReview({
    resultPath,
    assignmentName: "Assignment A",
    review: { studentName: "Reviewed", studentKey: "20230001", status: "reviewed", suggestedScore: 86 },
  });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment A",
    review: { studentName: "Manual", studentKey: "20230002", status: "manual_review", statusReason: "cannot_open_attachment" },
  });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment A",
    review: { studentName: "Skipped", studentKey: "20230003", status: "skipped", statusReason: "user_skipped" },
  });

  assert.deepEqual(extractHandledStudentKeys({ resultPath, assignmentName: "Assignment A" }), [
    "20230001",
    "20230002",
    "20230003",
  ]);
  assert.deepEqual(extractSkippedStudentKeys({ resultPath, assignmentName: "Assignment A" }), ["20230003"]);
});

test("rubric record stores rubric as a structured object", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-rubric-record-"));
  const rubricPath = createRubricRecordFile({
    outputDir: root,
    courseName: "Course A",
    assignmentName: "Assignment A",
    assignmentSummary: "Make a short video.",
    dimensions: [
      { name: "Completeness", points: 40, criteria: "Includes required files." },
    ],
    reviewPriority: [
      "Inspect final render images first.",
      "Read the report summary only if visual evidence is insufficient.",
    ],
    status: "confirmed",
  });

  const rubric = loadRecord(rubricPath);

  assert.equal(rubric.kind, "fanya_rubric");
  assert.equal(rubric.assignmentName, "Assignment A");
  assert.equal(rubric.dimensions[0].points, 40);
  assert.deepEqual(rubric.reviewPriority, [
    "Inspect final render images first.",
    "Read the report summary only if visual evidence is insufficient.",
  ]);
});

test("new rubric records include fast bundle review priority by default without fallback representative terms", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-rubric-priority-"));
  const rubricPath = createRubricRecordFile({
    outputDir: root,
    courseName: "Course A",
    assignmentName: "Assignment A",
    status: "confirmed",
  });

  const rubric = loadRecord(rubricPath);

  assert.equal(rubric.reviewPriority.recommendedMode, "fast_bundle");
  assert.equal(rubric.reviewPriority.commentRule.includes("personalized"), true);
  assert.equal(Array.isArray(rubric.reviewPriority.representativeMediaTerms), true);
  assert.deepEqual(rubric.reviewPriority.representativeMediaTerms, []);
  assert.equal(Array.isArray(rubric.reviewPriority.representativeMediaSlots), true);
  assert.deepEqual(rubric.reviewPriority.representativeMediaSlots, []);
  assert.deepEqual(defaultReviewPriority().representativeMediaRules, {
    videoFrameCount: 3,
    pdfMaxPages: 3,
  });
});

test("syncRecordContext updates rubric course and assignment names", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-sync-rubric-"));
  const rubricPath = createRubricRecordFile({
    outputDir: root,
    courseName: "Old Course",
    assignmentName: "Old Assignment",
  });

  const result = syncRecordContext({
    recordPath: rubricPath,
    courseName: "Web Course",
    assignmentName: "Web Assignment",
  });

  const rubric = loadRecord(rubricPath);
  assert.equal(result.updated, true);
  assert.equal(rubric.courseName, "Web Course");
  assert.equal(rubric.assignmentName, "Web Assignment");
});

test("syncRecordContext updates the selected result assignment name", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-sync-result-"));
  const resultPath = createResultRecordFile({
    outputDir: root,
    courseName: "Old Course",
    assignmentName: "Old Assignment",
  });

  syncRecordContext({
    recordPath: resultPath,
    courseName: "Web Course",
    assignmentName: "Web Assignment",
    previousAssignmentName: "Old Assignment",
  });

  const result = loadRecord(resultPath);
  assert.equal(result.courseName, "Web Course");
  assert.equal(result.assignments[0].assignmentName, "Web Assignment");
});
