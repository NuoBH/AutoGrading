const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createResultRecordFile, appendStudentReview, loadRecord } = require("../scripts/record-store.cjs");
const { saveStudentIndex, loadStudentIndex } = require("../scripts/student-index.cjs");
const { initSession, loadSession } = require("../scripts/task-session.cjs");
const { syncWebCompletedStudents } = require("../scripts/sync-web-completed-students.cjs");

function setupBundleSyncFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-bundle-web-sync-"));
  const assignmentName = "Assignment A";
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course A",
    assignmentName,
  });
  const studentIndexPath = path.join(root, "tmp", "session", "fanya-current-student-index.json");
  const sessionPath = path.join(root, "tmp", "session", "fanya-current-task.json");
  const rosterJsonPath = path.join(root, "tmp", "session", "web-roster.json");

  saveStudentIndex({
    indexPath: studentIndexPath,
    courseName: "Course A",
    assignmentName,
    reviewMode: "bundle_zip",
    source: "bundle_students_dir",
    students: [
      { studentName: "Alpha Student", studentKey: "20230001", statusAtImport: "pending" },
      { studentName: "Beta Student", studentKey: "20230002", statusAtImport: "pending" },
      { studentName: "Gamma Student", studentKey: "20230003", statusAtImport: "pending" },
      { studentName: "Delta Student", studentKey: "20230004", statusAtImport: "pending" },
    ],
  });
  initSession({
    sessionPath,
    courseName: "Course A",
    assignmentName,
    localWorkIndex: 9,
    reviewMode: "bundle_zip",
    status: "reviewing_students",
    resultPath,
    studentIndexPath,
    studentsDir: path.join(root, "students"),
    currentStudentKey: "20230001",
    completedStudentKeys: [],
    skippedStudentKeys: [],
  });

  return { root, assignmentName, resultPath, studentIndexPath, sessionPath, rosterJsonPath };
}

function writeRoster(filePath, rows) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ rows }, null, 2)}\n`, "utf8");
}

test("syncWebCompletedStudents writes matched website-completed bundle students to result and session", () => {
  const fixture = setupBundleSyncFixture();
  writeRoster(fixture.rosterJsonPath, [
    { text: "20230001 Alpha Student Completed", cells: ["20230001", "Alpha Student", "Completed"], links: [] },
    { text: "20230003 Gamma Student To be reviewed", cells: ["20230003", "Gamma Student", "To be reviewed"], links: [] },
  ]);

  const result = syncWebCompletedStudents({
    studentIndexPath: fixture.studentIndexPath,
    resultPath: fixture.resultPath,
    assignmentName: fixture.assignmentName,
    sessionPath: fixture.sessionPath,
    rosterJsonPath: fixture.rosterJsonPath,
  });

  const review = loadRecord(fixture.resultPath).assignments[0].reviews[0];
  const session = loadSession(fixture.sessionPath);
  assert.deepEqual(result.matchedStudentKeys, ["20230001"]);
  assert.deepEqual(result.appendedStudentKeys, ["20230001"]);
  assert.deepEqual(session.completedStudentKeys, ["20230001"]);
  assert.equal(session.skippedStudentKeys.length, 0);
  assert.equal(review.status, "reviewed");
  assert.equal(review.statusReason, "already_completed_on_website");
  assert.equal(review.suggestedScore, null);
});

test("syncWebCompletedStudents reports completed web rows not present in bundle index", () => {
  const fixture = setupBundleSyncFixture();
  writeRoster(fixture.rosterJsonPath, [
    { text: "20990001 External Student Completed", cells: ["20990001", "External Student", "Completed"], links: [] },
  ]);

  const result = syncWebCompletedStudents({
    studentIndexPath: fixture.studentIndexPath,
    resultPath: fixture.resultPath,
    assignmentName: fixture.assignmentName,
    sessionPath: fixture.sessionPath,
    rosterJsonPath: fixture.rosterJsonPath,
  });

  assert.deepEqual(result.matchedStudentKeys, []);
  assert.equal(result.unmatchedCompletedStudents.length, 1);
  assert.equal(loadRecord(fixture.resultPath).assignments[0].reviews.length, 0);
  assert.deepEqual(loadSession(fixture.sessionPath).completedStudentKeys, []);
});

test("syncWebCompletedStudents does not overwrite existing reviewed or skipped records", () => {
  const fixture = setupBundleSyncFixture();
  appendStudentReview({
    resultPath: fixture.resultPath,
    assignmentName: fixture.assignmentName,
    review: {
      studentName: "Alpha Student",
      studentKey: "20230001",
      status: "reviewed",
      suggestedScore: 90,
      comment: "Keep existing review.",
    },
  });
  appendStudentReview({
    resultPath: fixture.resultPath,
    assignmentName: fixture.assignmentName,
    review: {
      studentName: "Beta Student",
      studentKey: "20230002",
      status: "skipped",
      suggestedScore: null,
      statusReason: "user_skipped",
    },
  });
  writeRoster(fixture.rosterJsonPath, [
    { text: "20230001 Alpha Student Completed", cells: ["20230001", "Alpha Student", "Completed"], links: [] },
    { text: "20230002 Beta Student Completed", cells: ["20230002", "Beta Student", "Completed"], links: [] },
  ]);

  const result = syncWebCompletedStudents({
    studentIndexPath: fixture.studentIndexPath,
    resultPath: fixture.resultPath,
    assignmentName: fixture.assignmentName,
    sessionPath: fixture.sessionPath,
    rosterJsonPath: fixture.rosterJsonPath,
  });

  const reviews = loadRecord(fixture.resultPath).assignments[0].reviews;
  assert.deepEqual(result.matchedStudentKeys, ["20230001"]);
  assert.deepEqual(result.skippedStudentKeys, ["20230002"]);
  assert.deepEqual(result.appendedStudentKeys, []);
  assert.equal(reviews.length, 2);
  assert.equal(reviews[0].comment, "Keep existing review.");
  assert.equal(reviews[1].status, "skipped");
  assert.deepEqual(loadSession(fixture.sessionPath).completedStudentKeys, ["20230001"]);
});

test("syncWebCompletedStudents can match completed web rows by fuzzy name when web id is missing", () => {
  const fixture = setupBundleSyncFixture();
  writeRoster(fixture.rosterJsonPath, [
    { text: "Alpha   Student Completed", cells: ["Alpha   Student", "Completed"], links: [] },
  ]);

  const result = syncWebCompletedStudents({
    studentIndexPath: fixture.studentIndexPath,
    resultPath: fixture.resultPath,
    assignmentName: fixture.assignmentName,
    sessionPath: fixture.sessionPath,
    rosterJsonPath: fixture.rosterJsonPath,
  });

  assert.deepEqual(result.matchedStudentKeys, ["20230001"]);
  assert.deepEqual(loadSession(fixture.sessionPath).completedStudentKeys, ["20230001"]);
});

test("syncWebCompletedStudents keeps bundle index statusAtImport unchanged", () => {
  const fixture = setupBundleSyncFixture();
  writeRoster(fixture.rosterJsonPath, [
    { text: "20230004 Delta Student Completed", cells: ["20230004", "Delta Student", "Completed"], links: [] },
  ]);

  syncWebCompletedStudents({
    studentIndexPath: fixture.studentIndexPath,
    resultPath: fixture.resultPath,
    assignmentName: fixture.assignmentName,
    sessionPath: fixture.sessionPath,
    rosterJsonPath: fixture.rosterJsonPath,
  });

  const index = loadStudentIndex(fixture.studentIndexPath);
  assert.deepEqual(index.students.map((student) => student.statusAtImport), [
    "pending",
    "pending",
    "pending",
    "pending",
  ]);
});

test("sync-web-completed-students CLI accepts documented argument names", () => {
  const fixture = setupBundleSyncFixture();
  writeRoster(fixture.rosterJsonPath, [
    { text: "20230001 Alpha Student Completed", cells: ["20230001", "Alpha Student", "Completed"], links: [] },
  ]);

  const stdout = execFileSync(process.execPath, [
    path.join(__dirname, "..", "scripts", "sync-web-completed-students.cjs"),
    "--student-index", fixture.studentIndexPath,
    "--result-path", fixture.resultPath,
    "--assignment", fixture.assignmentName,
    "--session-path", fixture.sessionPath,
    "--roster-json", fixture.rosterJsonPath,
  ], { encoding: "utf8" });

  const result = JSON.parse(stdout);
  assert.deepEqual(result.matchedStudentKeys, ["20230001"]);
  assert.deepEqual(loadSession(fixture.sessionPath).completedStudentKeys, ["20230001"]);
});
