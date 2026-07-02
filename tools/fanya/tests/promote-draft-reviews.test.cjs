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
  loadRecord,
  saveRecord,
  upsertDraftReviews,
} = require("../scripts/record-store.cjs");
const { saveStudentIndex } = require("../scripts/student-index.cjs");
const { initSession, loadSession } = require("../scripts/task-session.cjs");

const SCRIPT = path.join(__dirname, "..", "scripts", "promote-draft-reviews.cjs");

test("promoteDraftReviews converts drafts into formal reviews and marks completed", () => {
  const fixture = createFixture();
  upsertDraftReviews({
    resultPath: fixture.resultPath,
    assignmentName: "Assignment",
    drafts: [{ studentName: "Student A", studentKey: "20230001", suggestedScore: 84, comment: "The work is complete and visually coherent." }],
  });

  const stdout = execFileSync(process.execPath, [
    SCRIPT,
    "--result-path",
    fixture.resultPath,
    "--assignment",
    "Assignment",
    "--session-path",
    fixture.sessionPath,
  ], { encoding: "utf8" });
  const printed = JSON.parse(stdout);
  const record = loadRecord(fixture.resultPath);
  const session = loadSession(fixture.sessionPath);

  assert.deepEqual(printed.promoted, ["20230001"]);
  assert.equal(record.assignments[0].reviews.length, 1);
  assert.equal(record.assignments[0].reviews[0].status, "reviewed");
  assert.equal(record.assignments[0].reviews[0].suggestedScore, 84);
  assert.equal(record.assignments[0].reviews[0].comment, "The work is complete and visually coherent.");
  assert.equal(record.assignments[0].draftReviews[0].promoted, true);
  assert.equal(typeof record.assignments[0].draftReviews[0].promotedAt, "string");
  assert.deepEqual(session.completedStudentKeys, ["20230001"]);
});

test("promoteDraftReviews dry-run reports readiness without mutating result or session", () => {
  const fixture = createFixture([
    { studentName: "Student A", studentKey: "20230001", statusAtImport: "pending" },
    { studentName: "Student B", studentKey: "20230002", statusAtImport: "pending" },
  ]);
  upsertDraftReviews({
    resultPath: fixture.resultPath,
    assignmentName: "Assignment",
    drafts: [
      { studentName: "Student A", studentKey: "20230001", suggestedScore: 84, comment: "The work is complete and visually coherent." },
      { studentName: "Student B", studentKey: "20230002", suggestedScore: 91, comment: "The submission shows strong polish and a clear visual identity." },
    ],
  });
  const beforeResult = fs.readFileSync(fixture.resultPath, "utf8");
  const beforeSession = fs.readFileSync(fixture.sessionPath, "utf8");

  const stdout = execFileSync(process.execPath, [
    SCRIPT,
    "--result-path",
    fixture.resultPath,
    "--assignment",
    "Assignment",
    "--session-path",
    fixture.sessionPath,
    "--dry-run",
  ], { encoding: "utf8" });
  const printed = JSON.parse(stdout);

  assert.equal(printed.dryRun, true);
  assert.equal(printed.wouldPromoteCount, 2);
  assert.deepEqual(printed.scoreDistribution, { "70-79": 0, "80-89": 1, "90-100": 1, "other": 0 });
  assert.deepEqual(printed.blockingIssues, []);
  assert.equal(fs.readFileSync(fixture.resultPath, "utf8"), beforeResult);
  assert.equal(fs.readFileSync(fixture.sessionPath, "utf8"), beforeSession);
});

test("promoteDraftReviews does not overwrite existing final, skipped, or manual review records", () => {
  const fixture = createFixture([
    { studentName: "Student A", studentKey: "20230001", statusAtImport: "pending" },
    { studentName: "Student B", studentKey: "20230002", statusAtImport: "pending" },
    { studentName: "Student C", studentKey: "20230003", statusAtImport: "pending" },
  ]);
  appendStudentReview({
    resultPath: fixture.resultPath,
    assignmentName: "Assignment",
    review: { studentName: "Student A", studentKey: "20230001", status: "reviewed", suggestedScore: 90, comment: "Existing final." },
  });
  appendStudentReview({
    resultPath: fixture.resultPath,
    assignmentName: "Assignment",
    review: { studentName: "Student B", studentKey: "20230002", status: "skipped", statusReason: "user_skipped" },
  });
  appendStudentReview({
    resultPath: fixture.resultPath,
    assignmentName: "Assignment",
    review: { studentName: "Student C", studentKey: "20230003", status: "manual_review", statusReason: "cannot_open_attachment" },
  });
  const record = loadRecord(fixture.resultPath);
  record.assignments[0].draftReviews = [
    { studentName: "Student A", studentKey: "20230001", suggestedScore: 70, comment: "Should not replace final.", status: "draft" },
    { studentName: "Student B", studentKey: "20230002", suggestedScore: 71, comment: "Should not replace skipped.", status: "draft" },
    { studentName: "Student C", studentKey: "20230003", suggestedScore: 72, comment: "Should not replace manual.", status: "draft" },
  ];
  saveRecord(fixture.resultPath, record);

  const stdout = execFileSync(process.execPath, [
    SCRIPT,
    "--result-path",
    fixture.resultPath,
    "--assignment",
    "Assignment",
    "--session-path",
    fixture.sessionPath,
  ], { encoding: "utf8" });
  const printed = JSON.parse(stdout);
  const reviews = loadRecord(fixture.resultPath).assignments[0].reviews;

  assert.deepEqual(printed.promoted, []);
  assert.deepEqual(printed.skippedBecauseFinalExists, ["20230001", "20230002", "20230003"]);
  assert.equal(reviews.find((review) => review.studentKey === "20230001").suggestedScore, 90);
  assert.equal(reviews.find((review) => review.studentKey === "20230002").status, "skipped");
  assert.equal(reviews.find((review) => review.studentKey === "20230003").status, "manual_review");
});

test("promoteDraftReviews fails without mutating files when a draft key is missing from student index", () => {
  const fixture = createFixture([{ studentName: "Student A", studentKey: "20230001", statusAtImport: "pending" }]);
  upsertDraftReviews({
    resultPath: fixture.resultPath,
    assignmentName: "Assignment",
    drafts: [{ studentName: "Missing", studentKey: "local-999", suggestedScore: 81, comment: "The submission appears mostly complete." }],
  });
  const beforeResult = fs.readFileSync(fixture.resultPath, "utf8");
  const beforeSession = fs.readFileSync(fixture.sessionPath, "utf8");

  assert.throws(() => execFileSync(process.execPath, [
    SCRIPT,
    "--result-path",
    fixture.resultPath,
    "--assignment",
    "Assignment",
    "--session-path",
    fixture.sessionPath,
  ], { encoding: "utf8", stdio: "pipe" }), /draft studentKey is not in current student index/u);

  assert.equal(fs.readFileSync(fixture.resultPath, "utf8"), beforeResult);
  assert.equal(fs.readFileSync(fixture.sessionPath, "utf8"), beforeSession);
  assert.equal(loadRecord(fixture.resultPath).assignments[0].reviews.length, 0);
  assert.equal(loadSession(fixture.sessionPath).completedStudentKeys.length, 0);
  assert.equal(assignmentDraftReviews(fixture.resultPath, "Assignment").length, 1);
});

function createFixture(students = [{ studentName: "Student A", studentKey: "20230001", statusAtImport: "pending" }]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-promote-drafts-"));
  const sessionDir = path.join(root, "tmp", "session");
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });
  const index = saveStudentIndex({
    indexPath: path.join(sessionDir, "fanya-current-student-index.json"),
    courseName: "Course",
    assignmentName: "Assignment",
    reviewMode: "bundle_zip",
    source: "test",
    students,
  });
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    resultPath,
    reviewSourcePath: root,
    studentIndexPath: index.indexPath,
    studentsDir: path.join(root, "students"),
  });
  return { root, resultPath, sessionPath, studentIndexPath: index.indexPath };
}
