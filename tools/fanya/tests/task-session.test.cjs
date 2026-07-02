const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  DEFAULT_STUDENT_INDEX_PATH,
} = require("../scripts/student-index.cjs");

const {
  initSession,
  isComplete,
  loadSession,
  markCompleted,
  markCompletedSyncDecision,
  markSkippedDecision,
  markSkipped,
  nextStudentFromSession,
  clearSession,
} = require("../scripts/task-session.cjs");

test("initSession writes one resumable task state file", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-session-"));
  const sessionPath = path.join(root, "tmp", "session", "fanya-current-task.json");
  const studentIndexPath = path.join(root, "tmp", "session", "fanya-current-student-index.json");

  const session = initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    rubricPath: "rubrics/Course/Assignment-rubric.cjs",
    resultPath: "result/Course.cjs",
    reviewSourcePath: "tmp/work-1/bundle-Assignment",
    sourceZip: "tmp/bundle/Assignment.zip",
    studentsDir: "tmp/work-1/bundle-Assignment/students",
    studentIndexPath,
  });

  assert.equal(fs.existsSync(sessionPath), true);
  assert.equal(session.courseName, "Course");
  assert.equal(loadSession(sessionPath).reviewMode, "bundle_zip");
  assert.equal(loadSession(sessionPath).studentIndexPath, studentIndexPath);
});

test("markCompleted updates completed keys and advances current student", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-session-"));
  const sessionPath = path.join(root, "session.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    rubricPath: "rubrics/Course/Assignment-rubric.cjs",
    resultPath: "result/Course.cjs",
    reviewSourcePath: "tmp/work-1/bundle-Assignment",
    sourceZip: "tmp/bundle/Assignment.zip",
    studentsDir: "tmp/work-1/bundle-Assignment/students",
    currentStudentKey: "20230001",
  });

  const updated = markCompleted({
    sessionPath,
    studentKey: "20230001",
    studentKeys: ["20230001", "local-002"],
  });

  assert.deepEqual(updated.completedStudentKeys, ["20230001"]);
  assert.equal(updated.currentStudentKey, "local-002");
});

test("markCompletedSyncDecision advances bundle setup to skipped decision", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-session-"));
  const sessionPath = path.join(root, "session.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    status: "needs_bundle_completed_sync_decision",
    rubricPath: "rubrics/Course/Assignment-rubric.cjs",
    resultPath: "result/Course.cjs",
    reviewSourcePath: "tmp/work-1/bundle-Assignment",
    sourceZip: "tmp/bundle/Assignment.zip",
    studentsDir: "tmp/work-1/bundle-Assignment/students",
    currentStudentKey: "20230001",
  });

  const updated = markCompletedSyncDecision({ sessionPath, decision: "no" });

  assert.equal(updated.completedSyncDecision, "no");
  assert.equal(updated.status, "needs_skipped_decision");
  assert.equal(loadSession(sessionPath).status, "needs_skipped_decision");
});

test("markCompletedSyncDecision rejects unknown decisions", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-session-"));
  const sessionPath = path.join(root, "session.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    status: "needs_bundle_completed_sync_decision",
  });

  assert.throws(
    () => markCompletedSyncDecision({ sessionPath, decision: "maybe" }),
    /decision must be yes or no/,
  );
});

test("markSkippedDecision advances setup to reviewing students", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-session-"));
  const sessionPath = path.join(root, "session.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    status: "needs_skipped_decision",
    completedSyncDecision: "no",
  });

  const updated = markSkippedDecision({ sessionPath, decision: "none" });

  assert.equal(updated.skippedDecision, "none");
  assert.equal(updated.status, "reviewing_students");
  assert.equal(loadSession(sessionPath).status, "reviewing_students");
});

test("skipped students are tracked separately and treated as handled", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-session-"));
  const sessionPath = path.join(root, "session.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    rubricPath: "rubrics/Course/Assignment-rubric.cjs",
    resultPath: "result/Course.cjs",
    reviewSourcePath: "tmp/work-1/bundle-Assignment",
    sourceZip: "tmp/bundle/Assignment.zip",
    studentsDir: "tmp/work-1/bundle-Assignment/students",
    completedStudentKeys: ["20230001"],
    currentStudentKey: "local-001",
  });

  const updated = markSkipped({
    sessionPath,
    studentKey: "local-001",
    studentKeys: ["20230001", "local-001", "20230003"],
  });

  assert.deepEqual(updated.skippedStudentKeys, ["local-001"]);
  assert.deepEqual(updated.completedStudentKeys, ["20230001"]);
  assert.equal(updated.currentStudentKey, "20230003");
});

test("initSession keeps skipped keys out of completed keys", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-session-"));
  const sessionPath = path.join(root, "session.json");

  const session = initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    rubricPath: "rubrics/Course/Assignment-rubric.cjs",
    resultPath: "result/Course.cjs",
    reviewSourcePath: "tmp/work-1/bundle-Assignment",
    studentsDir: "tmp/work-1/bundle-Assignment/students",
    completedStudentKeys: ["20230001"],
    skippedStudentKeys: ["local-001"],
  });

  assert.deepEqual(session.completedStudentKeys, ["20230001"]);
  assert.deepEqual(session.skippedStudentKeys, ["local-001"]);
});

test("nextStudentFromSession scans studentsDir and skips handled keys after a new session is loaded", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-session-"));
  const studentsDir = path.join(root, "students");
  fs.mkdirSync(path.join(studentsDir, "20230001-A"), { recursive: true });
  fs.mkdirSync(path.join(studentsDir, "local-001-B"), { recursive: true });
  fs.mkdirSync(path.join(studentsDir, "20230003-C"), { recursive: true });
  const sessionPath = path.join(root, "session.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    rubricPath: "rubrics/Course/Assignment-rubric.cjs",
    resultPath: "result/Course.cjs",
    reviewSourcePath: "tmp/work-1/bundle-Assignment",
    sourceZip: "tmp/bundle/Assignment.zip",
    studentsDir,
    completedStudentKeys: ["20230001"],
    skippedStudentKeys: ["local-001"],
  });

  assert.equal(nextStudentFromSession(loadSession(sessionPath)), "20230003");
  assert.equal(isComplete(loadSession(sessionPath)), false);
});

test("isComplete returns true when all student folders are completed or skipped", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-session-"));
  const studentsDir = path.join(root, "students");
  fs.mkdirSync(path.join(studentsDir, "20230001-A"), { recursive: true });
  fs.mkdirSync(path.join(studentsDir, "local-001-B"), { recursive: true });
  const sessionPath = path.join(root, "session.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    rubricPath: "rubrics/Course/Assignment-rubric.cjs",
    resultPath: "result/Course.cjs",
    reviewSourcePath: "tmp/work-1/bundle-Assignment",
    sourceZip: "tmp/bundle/Assignment.zip",
    studentsDir,
    completedStudentKeys: ["20230001"],
    skippedStudentKeys: ["local-001"],
  });

  assert.equal(isComplete(loadSession(sessionPath)), true);
});

test("nextStudentFromSession prefers student index keys over studentsDir", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-session-index-"));
  const sessionDir = path.join(root, "tmp", "session");
  const studentIndexPath = path.join(sessionDir, "fanya-current-student-index.json");
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(studentIndexPath, JSON.stringify({
    schemaVersion: 1,
    courseName: "Course",
    assignmentName: "Assignment",
    reviewMode: "web_download",
    source: "web_roster",
    students: [
      { studentName: "Student A", studentKey: "20230001", statusAtImport: "pending" },
      { studentName: "Student B", studentKey: "20230002", statusAtImport: "pending" },
    ],
  }));
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "web_download",
    rubricPath: "rubrics/Course/Assignment-rubric.cjs",
    resultPath: "result/Course.cjs",
    reviewSourcePath: "tmp/work-1",
    studentIndexPath,
    studentsDir: "",
    completedStudentKeys: ["20230001"],
  });

  assert.equal(nextStudentFromSession(loadSession(sessionPath)), "20230002");
});

test("isComplete uses student index keys when present", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-session-index-"));
  const sessionDir = path.join(root, "tmp", "session");
  const studentIndexPath = path.join(sessionDir, "fanya-current-student-index.json");
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(studentIndexPath, JSON.stringify({
    schemaVersion: 1,
    courseName: "Course",
    assignmentName: "Assignment",
    reviewMode: "bundle_zip",
    source: "bundle_students_dir",
    students: [
      { studentName: "Student A", studentKey: "20230001", statusAtImport: "pending" },
      { studentName: "Student B", studentKey: "20230002", statusAtImport: "pending" },
    ],
  }));
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    rubricPath: "rubrics/Course/Assignment-rubric.cjs",
    resultPath: "result/Course.cjs",
    reviewSourcePath: "tmp/work-1",
    studentIndexPath,
    studentsDir: "",
    completedStudentKeys: ["20230001"],
    skippedStudentKeys: ["20230002"],
  });

  assert.equal(isComplete(loadSession(sessionPath)), true);
});

test("markCompleted advances using student index keys when studentKeys are omitted", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-session-index-"));
  const sessionDir = path.join(root, "tmp", "session");
  const studentIndexPath = path.join(sessionDir, "fanya-current-student-index.json");
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(studentIndexPath, JSON.stringify({
    schemaVersion: 1,
    courseName: "Course",
    assignmentName: "Assignment",
    reviewMode: "web_download",
    source: "web_roster",
    students: [
      { studentName: "Student A", studentKey: "20230001", statusAtImport: "pending" },
      { studentName: "Student B", studentKey: "20230002", statusAtImport: "pending" },
    ],
  }));
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "web_download",
    rubricPath: "rubrics/Course/Assignment-rubric.cjs",
    resultPath: "result/Course.cjs",
    reviewSourcePath: "tmp/work-1",
    studentIndexPath,
    studentsDir: "",
    currentStudentKey: "20230001",
  });

  const updated = markCompleted({ sessionPath, studentKey: "20230001" });

  assert.equal(updated.currentStudentKey, "20230002");
});

test("clearSession removes current task state", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-session-"));
  const sessionPath = path.join(root, "session.json");
  fs.writeFileSync(sessionPath, "{}");

  clearSession(sessionPath);

  assert.equal(fs.existsSync(sessionPath), false);
});

test("clearSession keeps the session directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-session-"));
  const sessionDir = path.join(root, "tmp", "session");
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(sessionPath, "{}");

  clearSession(sessionPath);

  assert.equal(fs.existsSync(sessionPath), false);
  assert.equal(fs.existsSync(sessionDir), true);
});

test("clearSession removes the recorded student index but keeps tmp session", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-session-"));
  const sessionDir = path.join(root, "tmp", "session");
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  const indexPath = path.join(sessionDir, "fanya-current-student-index.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(indexPath, "{}");
  fs.writeFileSync(sessionPath, JSON.stringify({ studentIndexPath: indexPath }));

  clearSession(sessionPath);

  assert.equal(fs.existsSync(sessionPath), false);
  assert.equal(fs.existsSync(indexPath), false);
  assert.equal(fs.existsSync(sessionDir), true);
});

test("clearSession also removes the default index next to a custom session file", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-session-"));
  const sessionDir = path.join(root, "tmp", "session");
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  const indexPath = path.join(sessionDir, path.basename(DEFAULT_STUDENT_INDEX_PATH));
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(sessionPath, "{}");
  fs.writeFileSync(indexPath, "{}");

  clearSession(sessionPath);

  assert.equal(fs.existsSync(indexPath), false);
  assert.equal(fs.existsSync(sessionDir), true);
});
