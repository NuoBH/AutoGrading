const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createResultRecordFile, createRubricRecordFile } = require("../scripts/record-store.cjs");
const { saveStudentIndex } = require("../scripts/student-index.cjs");
const { resumeTask } = require("../scripts/resume-task.cjs");
const { initSession } = require("../scripts/task-session.cjs");

function setupEdgeFixture(indexPatch = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-flow-edge-"));
  const assignmentName = "Assignment A";
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course A",
    assignmentName,
  });
  const rubricPath = createRubricRecordFile({
    rubricPath: path.join(root, "rubric.cjs"),
    courseName: "Course A",
    assignmentName,
    status: "confirmed",
  });
  const sessionPath = path.join(root, "tmp", "session", "fanya-current-task.json");
  const studentIndexPath = path.join(root, "tmp", "session", "fanya-current-student-index.json");
  const studentsDir = path.join(root, "tmp", "work-1", "bundle-assignment", "students");
  fs.mkdirSync(path.join(studentsDir, "20230001-Alpha Student"), { recursive: true });

  saveStudentIndex({
    indexPath: studentIndexPath,
    courseName: indexPatch.courseName || "Course A",
    assignmentName: indexPatch.assignmentName || assignmentName,
    reviewMode: indexPatch.reviewMode || "bundle_zip",
    source: "bundle_students_dir",
    students: indexPatch.students || [
      { studentName: "Alpha Student", studentKey: "20230001", statusAtImport: "pending" },
    ],
  });

  initSession({
    sessionPath,
    courseName: "Course A",
    assignmentName,
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    status: "reviewing_students",
    rubricPath,
    resultPath,
    reviewSourcePath: path.join(root, "tmp", "work-1", "bundle-assignment"),
    studentIndexPath,
    sourceZip: path.join(root, "tmp", "bundle", "Assignment A.zip"),
    studentsDir,
    currentStudentKey: "20230001",
    completedStudentKeys: [],
    skippedStudentKeys: [],
  });

  return { root, sessionPath, studentIndexPath, studentsDir };
}

test("resumeTask blocks an empty student index", () => {
  const fixture = setupEdgeFixture({ students: [] });

  const result = resumeTask({ sessionPath: fixture.sessionPath, cwd: fixture.root });

  assert.equal(result.status, "blocked");
  assert.equal(result.issues.some((issue) => issue.code === "empty_student_index"), true);
});

test("resumeTask blocks duplicate student keys in the student index", () => {
  const fixture = setupEdgeFixture({
    students: [
      { studentName: "Alpha Student", studentKey: "20230001", statusAtImport: "pending" },
      { studentName: "Duplicate Student", studentKey: "20230001", statusAtImport: "pending" },
    ],
  });

  const result = resumeTask({ sessionPath: fixture.sessionPath, cwd: fixture.root });

  assert.equal(result.status, "blocked");
  assert.equal(result.issues.some((issue) => issue.code === "duplicate_student_keys"), true);
});

test("resumeTask blocks student index reviewMode mismatch", () => {
  const fixture = setupEdgeFixture({ reviewMode: "web_download" });

  const result = resumeTask({ sessionPath: fixture.sessionPath, cwd: fixture.root });

  assert.equal(result.status, "blocked");
  assert.equal(result.issues.some((issue) => issue.code === "student_index_mode_mismatch"), true);
});

test("resumeTask asks for user action on student index course or assignment mismatch", () => {
  const fixture = setupEdgeFixture({ assignmentName: "Other Assignment" });

  const result = resumeTask({ sessionPath: fixture.sessionPath, cwd: fixture.root });

  assert.equal(result.status, "needs_user_action");
  assert.equal(result.issues.some((issue) => issue.code === "student_index_context_mismatch"), true);
});

test("resumeTask blocks when current review evidence metadata is invalid JSON", () => {
  const fixture = setupEdgeFixture();
  const evidenceDir = path.join(fixture.studentsDir, "20230001-Alpha Student", "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "review-assets.json"), "{not json");

  const result = resumeTask({ sessionPath: fixture.sessionPath, cwd: fixture.root });

  assert.equal(result.status, "blocked");
  assert.equal(result.issues.some((issue) => issue.code === "current_state_failed"), true);
});
