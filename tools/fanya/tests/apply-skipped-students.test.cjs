const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { applySkippedStudents } = require("../scripts/apply-skipped-students.cjs");
const { createResultRecordFile, loadRecord } = require("../scripts/record-store.cjs");
const { saveStudentIndex } = require("../scripts/student-index.cjs");
const { initSession, loadSession } = require("../scripts/task-session.cjs");

function setupFixture(reviewMode = "web_download") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-skip-"));
  const assignmentName = "Assignment A";
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course A",
    assignmentName,
  });
  const studentIndexPath = path.join(root, "tmp", "session", "fanya-current-student-index.json");
  const sessionPath = path.join(root, "tmp", "session", "fanya-current-task.json");
  saveStudentIndex({
    indexPath: studentIndexPath,
    courseName: "Course A",
    assignmentName,
    reviewMode,
    source: reviewMode === "web_download" ? "web_roster" : "bundle_students_dir",
    students: [
      { studentName: "Alpha Student", studentKey: "20230001", statusAtImport: "pending" },
      { studentName: "Beta Student", studentKey: "20230002", statusAtImport: "pending" },
    ],
  });
  initSession({
    sessionPath,
    courseName: "Course A",
    assignmentName,
    localWorkIndex: 1,
    reviewMode,
    status: "needs_skipped_decision",
    resultPath,
    studentIndexPath,
    currentStudentKey: "20230001",
  });
  return { assignmentName, resultPath, studentIndexPath, sessionPath };
}

test("applySkippedStudents fuzzy matches names and stores skipped separately", () => {
  const fixture = setupFixture("bundle_zip");

  const result = applySkippedStudents({
    studentIndexPath: fixture.studentIndexPath,
    resultPath: fixture.resultPath,
    assignmentName: fixture.assignmentName,
    sessionPath: fixture.sessionPath,
    studentNames: ["Beta   Student"],
  });

  assert.deepEqual(result.matchedStudentKeys, ["20230002"]);
  assert.deepEqual(result.unmatchedNames, []);
  const session = loadSession(fixture.sessionPath);
  assert.deepEqual(session.skippedStudentKeys, ["20230002"]);
  assert.deepEqual(session.completedStudentKeys, []);
  assert.equal(session.status, "reviewing_students");
  assert.equal(session.skippedDecision, "done");
  assert.equal(loadRecord(fixture.resultPath).assignments[0].reviews[0].status, "skipped");
});

test("applySkippedStudents reports unmatched names without writing result records", () => {
  const fixture = setupFixture("web_download");

  const result = applySkippedStudents({
    studentIndexPath: fixture.studentIndexPath,
    resultPath: fixture.resultPath,
    assignmentName: fixture.assignmentName,
    sessionPath: fixture.sessionPath,
    studentNames: ["Missing Student"],
  });

  assert.deepEqual(result.matchedStudentKeys, []);
  assert.deepEqual(result.unmatchedNames, ["Missing Student"]);
  assert.equal(loadRecord(fixture.resultPath).assignments[0].reviews.length, 0);
  assert.deepEqual(loadSession(fixture.sessionPath).skippedStudentKeys, []);
  assert.equal(loadSession(fixture.sessionPath).status, "needs_skipped_decision");
});
