const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { importBundle } = require("../scripts/import-bundle.cjs");
const { appendStudentReview, createResultRecordFile } = require("../scripts/record-store.cjs");

test("importBundle restores skipped ids separately from handled result records", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-import-result-state-"));
  const bundleDir = path.join(root, "bundle");
  const source = path.join(root, "source");
  fs.mkdirSync(path.join(source, "20230001-Reviewed"), { recursive: true });
  fs.mkdirSync(path.join(source, "20230002-Manual"), { recursive: true });
  fs.mkdirSync(path.join(source, "20230003-Skipped"), { recursive: true });
  fs.mkdirSync(path.join(source, "20230004-Todo"), { recursive: true });
  fs.mkdirSync(bundleDir);
  for (const dir of fs.readdirSync(source)) {
    fs.writeFileSync(path.join(source, dir, "work.txt"), "work");
  }

  const archive = path.join(bundleDir, "Assignment.zip");
  execFileSync("tar", ["-a", "-cf", archive, "-C", source, "."], { stdio: "pipe" });
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment",
    review: { studentName: "Reviewed", studentKey: "20230001", status: "reviewed", suggestedScore: 88 },
  });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment",
    review: { studentName: "Manual", studentKey: "20230002", status: "manual_review", statusReason: "cannot_open_attachment" },
  });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment",
    review: { studentName: "Skipped", studentKey: "20230003", status: "skipped", statusReason: "user_skipped" },
  });

  const imported = importBundle({
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 6,
    bundleDir,
    outputRoot: path.join(root, "tmp", "work-6", "bundle-assignment"),
    sessionPath: path.join(root, "tmp", "session", "fanya-current-task.json"),
    resultPath,
    tools: { sevenZipPath: "", tarPath: "tar" },
  });

  assert.deepEqual(imported.session.completedStudentKeys, ["20230001", "20230002"]);
  assert.deepEqual(imported.session.skippedStudentKeys, ["20230003"]);
  assert.equal(imported.session.currentStudentKey, "20230004");
});
