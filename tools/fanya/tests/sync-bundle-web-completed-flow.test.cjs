const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { syncBundleWebCompletedFlow } = require("../scripts/sync-bundle-web-completed-flow.cjs");
const { createResultRecordFile, loadRecord } = require("../scripts/record-store.cjs");
const { saveStudentIndex, loadStudentIndex } = require("../scripts/student-index.cjs");
const { initSession, loadSession } = require("../scripts/task-session.cjs");

test("syncBundleWebCompletedFlow captures roster then syncs matched completed bundle students", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-bundle-sync-flow-"));
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
    ],
  });
  initSession({
    sessionPath,
    courseName: "Course A",
    assignmentName,
    localWorkIndex: 2,
    reviewMode: "bundle_zip",
    resultPath,
    studentIndexPath,
    currentStudentKey: "20230001",
  });

  const result = await syncBundleWebCompletedFlow({
    courseName: "Course A",
    assignmentName,
    studentIndexPath,
    resultPath,
    sessionPath,
    rosterJsonPath,
    captureRoster: async () => ({
      rows: [
        { text: "20230001 Alpha Student Completed", cells: ["20230001", "Alpha Student", "Completed"], links: [] },
        { text: "20230002 Beta Student To be reviewed", cells: ["20230002", "Beta Student", "To be reviewed"], links: [] },
        { text: "20990001 External Student Completed", cells: ["20990001", "External Student", "Completed"], links: [] },
      ],
      pageCount: 1,
    }),
  });

  assert.deepEqual(result.sync.matchedStudentKeys, ["20230001"]);
  assert.equal(result.sync.unmatchedCompletedStudents.length, 1);
  const session = loadSession(sessionPath);
  assert.deepEqual(session.completedStudentKeys, ["20230001"]);
  assert.equal(session.completedSyncDecision, "yes");
  assert.equal(session.status, "needs_skipped_decision");
  assert.equal(loadRecord(resultPath).assignments[0].reviews[0].statusReason, "already_completed_on_website");
  assert.deepEqual(loadStudentIndex(studentIndexPath).students.map((student) => student.statusAtImport), ["pending", "pending"]);
});
