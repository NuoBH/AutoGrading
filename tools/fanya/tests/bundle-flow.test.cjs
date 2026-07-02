const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { cleanupReviewedBundle } = require("../scripts/cleanup-reviewed-bundle.cjs");
const { importBundle } = require("../scripts/import-bundle.cjs");
const { prepareEvidence } = require("../scripts/prepare-evidence.cjs");
const { recordReview } = require("../scripts/record-review.cjs");
const { createResultRecordFile, createRubricRecordFile, loadRecord } = require("../scripts/record-store.cjs");
const { resumeTask } = require("../scripts/resume-task.cjs");
const { loadSession, markCompletedSyncDecision, markSkippedDecision } = require("../scripts/task-session.cjs");

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

function setupBundleFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-bundle-flow-"));
  const bundleDir = path.join(root, "tmp", "bundle");
  const sourceDir = path.join(root, "source");
  fs.mkdirSync(path.join(sourceDir, "wrapper", "20230001-Example Student"), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "wrapper", "20230001-Example Student", "poster.png"), PNG_BYTES);
  fs.mkdirSync(bundleDir, { recursive: true });
  const archive = path.join(bundleDir, "Smoke Assignment.zip");
  execFileSync("tar", ["-a", "-cf", archive, "-C", sourceDir, "."], { stdio: "pipe" });

  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Smoke Course",
    assignmentName: "Smoke Assignment",
  });
  const rubricPath = createRubricRecordFile({
    rubricPath: path.join(root, "rubric.cjs"),
    courseName: "Smoke Course",
    assignmentName: "Smoke Assignment",
    status: "confirmed",
  });

  return {
    root,
    bundleDir,
    archive,
    resultPath,
    rubricPath,
    sessionPath: path.join(root, "tmp", "session", "fanya-current-task.json"),
    studentIndexPath: path.join(root, "tmp", "session", "fanya-current-student-index.json"),
    workDir: path.join(root, "tmp", "work-1", "bundle-smoke"),
  };
}

test("bundle pseudo full flow imports, resumes, prepares evidence, records review, and cleans up", () => {
  const fixture = setupBundleFixture();

  const imported = importBundle({
    courseName: "Smoke Course",
    assignmentName: "Smoke Assignment",
    localWorkIndex: 1,
    bundleDir: fixture.bundleDir,
    outputRoot: fixture.workDir,
    sessionPath: fixture.sessionPath,
    studentIndexPath: fixture.studentIndexPath,
    resultPath: fixture.resultPath,
    rubricPath: fixture.rubricPath,
    tools: { tarPath: "tar", sevenZipPath: "" },
  });

  assert.equal(imported.status, "imported");
  assert.equal(imported.session.currentStudentKey, "20230001");

  const blockedForCompletedSync = resumeTask({ sessionPath: fixture.sessionPath, cwd: fixture.root });
  assert.equal(blockedForCompletedSync.status, "needs_user_action");
  assert.equal(blockedForCompletedSync.issues[0].code, "pending_completed_sync_decision");

  markCompletedSyncDecision({ sessionPath: fixture.sessionPath, decision: "no" });
  const blockedForSkipped = resumeTask({ sessionPath: fixture.sessionPath, cwd: fixture.root });
  assert.equal(blockedForSkipped.status, "needs_user_action");
  assert.equal(blockedForSkipped.issues[0].code, "pending_skipped_decision");

  markSkippedDecision({ sessionPath: fixture.sessionPath, decision: "none" });
  const firstResume = resumeTask({ sessionPath: fixture.sessionPath, cwd: fixture.root });
  assert.equal(firstResume.status, "resume_ready");
  assert.equal(firstResume.nextStudentKey, "20230001");

  const studentDir = path.join(imported.studentsDir, "20230001-Example Student");
  const evidence = prepareEvidence(studentDir, { tools: {} });
  assert.equal(evidence.evidenceComplete, true);
  assert.deepEqual(evidence.externalViewable, ["../poster.png"]);

  const record = recordReview({
    sessionPath: fixture.sessionPath,
    review: {
      studentName: "Example Student",
      studentKey: "20230001",
      status: "reviewed",
      submissionSummary: "image",
      suggestedScore: 86,
      comment: "Complete test submission.",
    },
  });
  assert.equal(record.appended, true);
  assert.equal(record.nextStudentKey, null);

  const completeResume = resumeTask({ sessionPath: fixture.sessionPath, cwd: fixture.root });
  assert.equal(completeResume.status, "complete");

  const result = loadRecord(fixture.resultPath);
  assert.equal(result.assignments[0].reviews.length, 1);
  assert.equal(loadSession(fixture.sessionPath).completedStudentKeys.includes("20230001"), true);

  const cleaned = cleanupReviewedBundle(fixture.sessionPath, {
    confirm: true,
    cwd: fixture.root,
    bundleDir: fixture.bundleDir,
  });
  assert.equal(cleaned.status, "cleaned");
  assert.equal(fs.existsSync(fixture.archive), false);
  assert.equal(fs.existsSync(fixture.workDir), false);
  assert.equal(fs.existsSync(fixture.bundleDir), true);
  assert.equal(fs.existsSync(path.dirname(fixture.sessionPath)), true);
});
