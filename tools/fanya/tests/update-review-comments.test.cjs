const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  appendStudentReview,
  createResultRecordFile,
  loadRecord,
} = require("../scripts/record-store.cjs");

const SCRIPT = path.join(__dirname, "..", "scripts", "update-review-comments.cjs");

test("updateReviewComments changes comments without changing score or status", () => {
  const { resultPath, updatesPath } = fixture();
  const { updateReviewComments } = require("../scripts/update-review-comments.cjs");

  const result = updateReviewComments({
    resultPath,
    assignmentName: "Assignment A",
    updatesPath,
  });
  const review = loadRecord(resultPath).assignments[0].reviews[0];

  assert.deepEqual(result, { updated: ["20230001"], missing: [] });
  assert.equal(review.comment, "Specific revised comment.");
  assert.equal(review.suggestedScore, 86);
  assert.equal(review.status, "reviewed");
});

test("update-review-comments CLI updates only matching assignment reviews", () => {
  const { resultPath, updatesPath } = fixture();

  const stdout = execFileSync(process.execPath, [
    SCRIPT,
    "--result-path",
    resultPath,
    "--assignment",
    "Assignment A",
    "--updates",
    updatesPath,
  ], { encoding: "utf8" });
  const printed = JSON.parse(stdout);
  const review = loadRecord(resultPath).assignments[0].reviews[0];

  assert.deepEqual(printed.updated, ["20230001"]);
  assert.equal(review.comment, "Specific revised comment.");
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-update-comments-"));
  const resultPath = createResultRecordFile({
    outputDir: root,
    courseName: "Course A",
    assignmentName: "Assignment A",
    date: "2026-06-30",
  });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment A",
    review: {
      studentName: "Student A",
      studentKey: "20230001",
      status: "reviewed",
      suggestedScore: 86,
      submissionSummary: "image",
      comment: "Old comment.",
    },
  });
  appendStudentReview({
    resultPath,
    assignmentName: "Other Assignment",
    review: {
      studentName: "Student A",
      studentKey: "20230001",
      status: "reviewed",
      suggestedScore: 70,
      submissionSummary: "image",
      comment: "Other assignment comment.",
    },
  });
  const updatesPath = path.join(root, "updates.json");
  fs.writeFileSync(updatesPath, JSON.stringify([
    { studentKey: "20230001", comment: "Specific revised comment." },
  ]), "utf8");
  return { resultPath, updatesPath };
}
