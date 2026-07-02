const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  appendStudentReview,
  assignmentDraftReviews,
  createResultRecordFile,
  extractHandledStudentKeys,
  extractSkippedStudentKeys,
  loadRecord,
  upsertDraftReviews,
} = require("../scripts/record-store.cjs");

const SCRIPT = path.join(__dirname, "..", "scripts", "record-draft-reviews.cjs");

test("recordDraftReviews writes draftReviews without touching final reviews", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-draft-record-"));
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });

  const result = upsertDraftReviews({
    resultPath,
    assignmentName: "Assignment",
    drafts: [{
      studentName: "Student A",
      studentKey: "20230001",
      suggestedScore: 84,
      comment: "Work is mostly complete with clear visual intent. Improve polish in the final details.",
    }],
  });
  const record = loadRecord(resultPath);

  assert.deepEqual(result.updated, ["20230001"]);
  assert.equal(record.assignments[0].reviews.length, 0);
  assert.equal(record.assignments[0].draftReviews.length, 1);
  assert.equal(record.assignments[0].draftReviews[0].status, "draft");
});

test("recordDraftReviews updates existing draft for the same studentKey", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-draft-update-"));
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });

  upsertDraftReviews({
    resultPath,
    assignmentName: "Assignment",
    drafts: [{ studentName: "Student A", studentKey: "20230001", suggestedScore: 80, comment: "The work is complete but still needs stronger visual polish." }],
  });
  upsertDraftReviews({
    resultPath,
    assignmentName: "Assignment",
    drafts: [{ studentName: "Student A", studentKey: "20230001", suggestedScore: 86, comment: "Updated specific comment." }],
  });

  const drafts = assignmentDraftReviews(resultPath, "Assignment");
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].suggestedScore, 86);
  assert.equal(drafts[0].comment, "Updated specific comment.");
});

test("recordDraftReviews rejects internal process wording in student-facing comments", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-draft-process-wording-"));
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });

  assert.throws(() => upsertDraftReviews({
    resultPath,
    assignmentName: "Assignment",
    drafts: [{
      studentName: "Student A",
      studentKey: "20230001",
      suggestedScore: 84,
      comment: "\u9700\u8981\u590d\u6838\u540e\u518d\u6b63\u5f0f\u8bc4\u5206\u3002",
    }],
  }), /student-facing comment must not include internal process wording/u);
});

test("recordDraftReviews stores internal notes separately from student-facing comments", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-draft-review-notes-"));
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });

  upsertDraftReviews({
    resultPath,
    assignmentName: "Assignment",
    drafts: [{
      studentName: "Student A",
      studentKey: "20230001",
      suggestedScore: 84,
      comment: "The work shows a coherent visual direction and mostly complete presentation. Improve material details and final polish.",
      reviewNotes: [{ issueCode: "needs_representative_image_review", internalNote: "Only a cover image was visible." }],
    }],
  });

  const drafts = assignmentDraftReviews(resultPath, "Assignment");
  assert.equal(drafts[0].reviewNotes[0].issueCode, "needs_representative_image_review");
  assert.equal(drafts[0].comment.includes("cover image was visible"), false);
});

test("recordDraftReviews does not overwrite formal reviewed records", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-draft-final-skip-"));
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment",
    review: { studentName: "Student A", studentKey: "20230001", status: "reviewed", suggestedScore: 90, comment: "Final comment." },
  });

  const result = upsertDraftReviews({
    resultPath,
    assignmentName: "Assignment",
    drafts: [{ studentName: "Student A", studentKey: "20230001", suggestedScore: 70, comment: "The visible submission is too incomplete for this score." }],
  });
  const record = loadRecord(resultPath);

  assert.deepEqual(result.updated, []);
  assert.deepEqual(result.skippedBecauseFinalExists, ["20230001"]);
  assert.equal(record.assignments[0].reviews[0].suggestedScore, 90);
  assert.equal(assignmentDraftReviews(resultPath, "Assignment").length, 0);
});

test("draftReviews do not count as handled or skipped student keys", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-draft-not-handled-"));
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });
  upsertDraftReviews({
    resultPath,
    assignmentName: "Assignment",
    drafts: [{ studentName: "Student A", studentKey: "20230001", suggestedScore: 82, comment: "The submission is readable and mostly complete." }],
  });

  assert.deepEqual(extractHandledStudentKeys({ resultPath, assignmentName: "Assignment" }), []);
  assert.deepEqual(extractSkippedStudentKeys({ resultPath, assignmentName: "Assignment" }), []);
});

test("record-draft-reviews CLI writes drafts from JSON", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-draft-cli-"));
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });
  const draftsPath = path.join(root, "drafts.json");
  fs.writeFileSync(draftsPath, JSON.stringify([
    { studentName: "Student A", studentKey: "20230001", suggestedScore: 85, comment: "Clear work with room for refinement." },
  ]));

  const stdout = execFileSync(process.execPath, [
    SCRIPT,
    "--result-path",
    resultPath,
    "--assignment",
    "Assignment",
    "--drafts",
    draftsPath,
  ], { encoding: "utf8" });
  const printed = JSON.parse(stdout);

  assert.deepEqual(printed.updated, ["20230001"]);
  assert.equal(assignmentDraftReviews(resultPath, "Assignment").length, 1);
});
