const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createRubricRecordFile } = require("../scripts/record-store.cjs");
const { prepareBundleEvidence, videoFrameCountFromSession } = require("../scripts/prepare-bundle-evidence.cjs");
const { initSession } = require("../scripts/task-session.cjs");

test("prepareBundleEvidence is optional and loops students from a students directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-bundle-evidence-"));
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "local-001-StudentA");
  fs.mkdirSync(studentDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "notes.unknown"), "unknown");

  const summary = prepareBundleEvidence(studentsDir, {
    tools: { ffmpegPath: "", pdftoppmPath: "", sevenZipPath: "", tarPath: "" },
  });

  assert.equal(summary.students.length, 1);
  assert.equal(summary.students[0].studentKey, "local-001");
  assert.equal(fs.existsSync(path.join(studentDir, "evidence", "review-assets.json")), true);
});

test("prepareBundleEvidence skips students already handled in the current session", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-bundle-evidence-skip-"));
  const studentsDir = path.join(root, "students");
  const doneDir = path.join(studentsDir, "20230001-Done");
  const todoDir = path.join(studentsDir, "20230002-Todo");
  fs.mkdirSync(doneDir, { recursive: true });
  fs.mkdirSync(todoDir, { recursive: true });
  fs.writeFileSync(path.join(doneDir, "notes.unknown"), "unknown");
  fs.writeFileSync(path.join(todoDir, "notes.unknown"), "unknown");
  const sessionPath = path.join(root, "session.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    reviewSourcePath: root,
    studentsDir,
    completedStudentKeys: ["20230001"],
  });

  const summary = prepareBundleEvidence(studentsDir, {
    sessionPath,
    tools: { ffmpegPath: "", pdftoppmPath: "", sevenZipPath: "", tarPath: "" },
  });

  assert.deepEqual(summary.skippedStudents.map((student) => student.studentKey), ["20230001"]);
  assert.deepEqual(summary.students.map((student) => student.studentKey), ["20230002"]);
  assert.equal(fs.existsSync(path.join(doneDir, "evidence", "review-assets.json")), false);
});

test("prepareBundleEvidence follows student index order when session has one", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-bundle-evidence-index-"));
  const studentsDir = path.join(root, "students");
  fs.mkdirSync(path.join(studentsDir, "20230002-StudentB"), { recursive: true });
  fs.mkdirSync(path.join(studentsDir, "20230001-StudentA"), { recursive: true });
  fs.writeFileSync(path.join(studentsDir, "20230002-StudentB", "image.png"), "image");
  fs.writeFileSync(path.join(studentsDir, "20230001-StudentA", "image.png"), "image");

  const sessionDir = path.join(root, "tmp", "session");
  const studentIndexPath = path.join(sessionDir, "fanya-current-student-index.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(studentIndexPath, JSON.stringify({
    schemaVersion: 1,
    courseName: "Course",
    assignmentName: "Assignment",
    reviewMode: "bundle_zip",
    source: "bundle_students_dir",
    students: [
      { studentName: "Student B", studentKey: "20230002", statusAtImport: "pending" },
      { studentName: "Student A", studentKey: "20230001", statusAtImport: "pending" },
    ],
  }));
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    resultPath: "result.cjs",
    reviewSourcePath: root,
    studentIndexPath,
    studentsDir,
  });

  const result = prepareBundleEvidence(studentsDir, { sessionPath, tools: {} });

  assert.deepEqual(result.students.map((student) => student.studentKey), ["20230002", "20230001"]);
});

test("prepareBundleEvidence reads videoFrameCount from the session rubric", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-bundle-evidence-video-count-"));
  const rubricPath = createRubricRecordFile({
    rubricPath: path.join(root, "rubric.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
    status: "confirmed",
    reviewPriority: {
      recommendedMode: "fast_bundle",
      suitableFor: ["video"],
      representativeMediaRules: { videoFrameCount: 12 },
    },
  });
  const sessionPath = path.join(root, "session.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    rubricPath,
  });

  const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));

  assert.equal(videoFrameCountFromSession(session), 12);
});

test("prepare-bundle-evidence CLI supports summary-only output and json-out", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-bundle-evidence-summary-"));
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "local-001-StudentA");
  const jsonOut = path.join(root, "summary.json");
  fs.mkdirSync(studentDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "work.png"), "image");

  const stdout = execFileSync(process.execPath, [
    path.join(__dirname, "..", "scripts", "prepare-bundle-evidence.cjs"),
    studentsDir,
    "--summary-only",
    "--json-out",
    jsonOut,
  ], { encoding: "utf8" });
  const printed = JSON.parse(stdout);
  const full = JSON.parse(fs.readFileSync(jsonOut, "utf8"));

  assert.equal(printed.status, "prepared_bundle_evidence");
  assert.equal(printed.summary.prepared, 1);
  assert.equal(printed.students, undefined);
  assert.equal(full.students.length, 1);
});
