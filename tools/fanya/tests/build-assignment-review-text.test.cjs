const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { buildAssignmentReviewText } = require("../scripts/build-assignment-review-text.cjs");
const { createResultRecordFile, appendStudentReview } = require("../scripts/record-store.cjs");
const { saveStudentIndex } = require("../scripts/student-index.cjs");
const { initSession } = require("../scripts/task-session.cjs");

function setupFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-assignment-review-text-"));
  const assignmentName = "Assignment";
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName,
  });
  const studentsDir = path.join(root, "tmp", "work-1", "bundle-assignment", "students");
  const alphaDir = path.join(studentsDir, "20230001-Alpha");
  const betaDir = path.join(studentsDir, "20230002-Beta");
  const gammaDir = path.join(studentsDir, "20230003-Gamma");
  for (const dir of [alphaDir, betaDir, gammaDir]) fs.mkdirSync(path.join(dir, "evidence"), { recursive: true });
  fs.writeFileSync(path.join(alphaDir, "evidence", "review-text.md"), "Alpha report text.", "utf8");
  fs.writeFileSync(path.join(alphaDir, "evidence", "review-assets.json"), JSON.stringify({
    evidenceComplete: true,
    reviewText: "review-text.md",
    textBundleComplete: true,
    textBundleStrategy: "generated",
  }, null, 2));
  fs.writeFileSync(path.join(betaDir, "evidence", "review-text.md"), "Beta report text.", "utf8");
  fs.writeFileSync(path.join(betaDir, "evidence", "review-assets.json"), JSON.stringify({
    evidenceComplete: true,
    reviewText: "review-text.md",
    textBundleComplete: true,
    textBundleStrategy: "generated",
  }, null, 2));
  fs.writeFileSync(path.join(gammaDir, "evidence", "review-assets.json"), JSON.stringify({
    evidenceComplete: false,
    reviewText: "",
  }, null, 2));

  const sessionDir = path.join(root, "tmp", "session");
  const studentIndexPath = path.join(sessionDir, "fanya-current-student-index.json");
  saveStudentIndex({
    indexPath: studentIndexPath,
    courseName: "Course",
    assignmentName,
    reviewMode: "bundle_zip",
    source: "bundle_students_dir",
    students: [
      { studentName: "Alpha", studentKey: "20230001", statusAtImport: "pending" },
      { studentName: "Beta", studentKey: "20230002", statusAtImport: "pending" },
      { studentName: "Gamma", studentKey: "20230003", statusAtImport: "pending" },
    ],
  });
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName,
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    resultPath,
    reviewSourcePath: path.dirname(studentsDir),
    studentIndexPath,
    studentsDir,
    skippedStudentKeys: ["20230002"],
  });
  return { root, assignmentName, resultPath, sessionPath, studentIndexPath, studentsDir };
}

test("buildAssignmentReviewText combines pending students and skips handled students by default", () => {
  const fixture = setupFixture();
  appendStudentReview({
    resultPath: fixture.resultPath,
    assignmentName: fixture.assignmentName,
    review: { studentName: "Alpha", studentKey: "20230001", status: "reviewed", suggestedScore: 86 },
  });
  const outPath = path.join(fixture.root, "tmp", "session", "assignment-review-text.md");
  const indexOutPath = path.join(fixture.root, "tmp", "session", "assignment-review-text-index.json");

  const result = buildAssignmentReviewText({
    sessionPath: fixture.sessionPath,
    outPath,
    indexOutPath,
  });
  const text = fs.readFileSync(outPath, "utf8");
  const index = JSON.parse(fs.readFileSync(indexOutPath, "utf8"));

  assert.equal(result.summary.included, 1);
  assert.equal(result.summary.skippedHandled, 2);
  assert.match(text, /20230003/);
  assert.doesNotMatch(text, /Alpha report text/);
  assert.doesNotMatch(text, /Beta report text/);
  const gamma = index.students.find((student) => student.studentKey === "20230003");
  assert.equal(gamma.status, "missing_review_text");
});

test("buildAssignmentReviewText includes review text with truncation metadata", () => {
  const fixture = setupFixture();
  const outPath = path.join(fixture.root, "assignment-review-text.md");
  const indexOutPath = path.join(fixture.root, "assignment-review-text-index.json");

  const result = buildAssignmentReviewText({
    sessionPath: fixture.sessionPath,
    outPath,
    indexOutPath,
    includeSkipped: true,
    maxCharsPerStudent: 12,
  });
  const text = fs.readFileSync(outPath, "utf8");
  const index = JSON.parse(fs.readFileSync(indexOutPath, "utf8"));
  const alpha = index.students.find((student) => student.studentKey === "20230001");

  assert.equal(result.summary.included, 3);
  assert.match(text, /Alpha report/);
  assert.match(text, /\[truncated\]/);
  assert.equal(alpha.truncated, true);
});

test("build-assignment-review-text CLI prints summary only", () => {
  const fixture = setupFixture();
  const outPath = path.join(fixture.root, "assignment-review-text.md");
  const indexOutPath = path.join(fixture.root, "assignment-review-text-index.json");

  const stdout = execFileSync(process.execPath, [
    path.join(__dirname, "..", "scripts", "build-assignment-review-text.cjs"),
    "--session-path",
    fixture.sessionPath,
    "--out",
    outPath,
    "--index-out",
    indexOutPath,
  ], { encoding: "utf8" });
  const printed = JSON.parse(stdout);

  assert.equal(printed.status, "assignment_review_text_built");
  assert.equal(printed.summary.included, 2);
  assert.equal(printed.students, undefined);
  assert.equal(fs.existsSync(outPath), true);
  assert.equal(fs.existsSync(indexOutPath), true);
});
