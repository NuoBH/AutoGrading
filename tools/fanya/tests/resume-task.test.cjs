const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createResultRecordFile, createRubricRecordFile, appendStudentReview, upsertDraftReviews } = require("../scripts/record-store.cjs");
const { saveStudentIndex } = require("../scripts/student-index.cjs");
const { initSession } = require("../scripts/task-session.cjs");
const { resumeTask } = require("../scripts/resume-task.cjs");

function setupResumeFixture({
  reviewMode = "bundle_zip",
  withEvidence = false,
  students = [{ studentName: "Alpha Student", studentKey: "20230001", statusAtImport: "pending" }],
  rubricReviewPriority = undefined,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-resume-task-"));
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
    ...(rubricReviewPriority ? { reviewPriority: rubricReviewPriority } : {}),
  });
  const sessionPath = path.join(root, "tmp", "session", "fanya-current-task.json");
  const studentIndexPath = path.join(root, "tmp", "session", "fanya-current-student-index.json");
  const workDir = path.join(root, "tmp", "work-1", reviewMode === "bundle_zip" ? "bundle-assignment" : "web-assignment");
  const studentsDir = path.join(workDir, "students");
  const studentDir = reviewMode === "bundle_zip"
    ? path.join(studentsDir, "20230001-Alpha Student")
    : path.join(root, "tmp", "work-1", "student-001");
  fs.mkdirSync(studentDir, { recursive: true });

  if (withEvidence) {
    const evidenceDir = path.join(studentDir, "evidence");
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(evidenceDir, "review-assets.json"), JSON.stringify({
      evidenceComplete: true,
      generatedEvidence: [],
      externalViewable: [],
    }, null, 2));
  }

  saveStudentIndex({
    indexPath: studentIndexPath,
    courseName: "Course A",
    assignmentName,
    reviewMode,
    source: reviewMode === "bundle_zip" ? "bundle_students_dir" : "web_roster",
    students: students.map((student) => ({
      ...student,
      ...(reviewMode === "web_download" ? { reviewUrl: `https://example.test/review-work?workAnswerId=${student.studentKey}` } : {}),
    })),
  });

  const sourceZip = path.join(root, "tmp", "bundle", "Assignment A.zip");
  fs.mkdirSync(path.dirname(sourceZip), { recursive: true });
  fs.writeFileSync(sourceZip, "fake zip placeholder");

  initSession({
    sessionPath,
    courseName: "Course A",
    assignmentName,
    localWorkIndex: 1,
    reviewMode,
    status: "reviewing_students",
    rubricPath,
    resultPath,
    reviewSourcePath: workDir,
    studentIndexPath,
    sourceZip,
    studentsDir: reviewMode === "bundle_zip" ? studentsDir : "",
    currentStudentKey: "20230001",
    completedStudentKeys: [],
    skippedStudentKeys: [],
  });

  return {
    root,
    assignmentName,
    resultPath,
    rubricPath,
    sessionPath,
    studentIndexPath,
    workDir,
    studentsDir,
    studentDir,
    sourceZip,
  };
}

test("resumeTask recommends fast-bundle batch draft flow before single-student review", () => {
  const fixture = setupResumeFixture({
    reviewMode: "bundle_zip",
    withEvidence: false,
    students: [
      { studentName: "Alpha Student", studentKey: "20230001", statusAtImport: "pending" },
      { studentName: "Beta Student", studentKey: "20230002", statusAtImport: "pending" },
    ],
    rubricReviewPriority: {
      recommendedMode: "fast_bundle",
      suitableFor: ["image", "mixed_doc_visual"],
      representativeMediaTerms: ["render"],
    },
  });
  fs.mkdirSync(path.join(fixture.studentsDir, "20230002-Beta Student"), { recursive: true });

  const result = resumeTask({ sessionPath: fixture.sessionPath });

  assert.equal(result.status, "resume_ready");
  assert.equal(result.nextActions.some((action) => action.includes("prepare-bundle-evidence.cjs")), true);
  assert.equal(result.nextActions.some((action) => action.includes("create-contact-sheet.cjs")), true);
  assert.equal(result.nextActions.some((action) => action.includes("prepare-evidence.cjs")), false);
});

test("resumeTask derives contact sheet video options from the rubric", () => {
  const fixture = setupResumeFixture({
    reviewMode: "bundle_zip",
    withEvidence: false,
    students: [
      { studentName: "Alpha Student", studentKey: "20230001", statusAtImport: "pending" },
      { studentName: "Beta Student", studentKey: "20230002", statusAtImport: "pending" },
    ],
    rubricReviewPriority: {
      recommendedMode: "fast_bundle",
      suitableFor: ["video"],
      representativeMediaRules: { videoFrameCount: 8 },
    },
  });
  fs.mkdirSync(path.join(fixture.studentsDir, "20230002-Beta Student"), { recursive: true });

  const result = resumeTask({ sessionPath: fixture.sessionPath });

  const contactSheetAction = result.nextActions.find((action) => action.includes("create-contact-sheet.cjs"));
  assert.equal(result.status, "resume_ready");
  assert.match(contactSheetAction, /--mode video-first/);
  assert.match(contactSheetAction, /--slots 8/);
});

test("resumeTask does not recommend contact sheet for pure text fast-bundle assignments", () => {
  const fixture = setupResumeFixture({
    reviewMode: "bundle_zip",
    withEvidence: false,
    students: [
      { studentName: "Alpha Student", studentKey: "20230001", statusAtImport: "pending" },
      { studentName: "Beta Student", studentKey: "20230002", statusAtImport: "pending" },
    ],
    rubricReviewPriority: {
      recommendedMode: "fast_bundle",
      suitableFor: ["text_document"],
      primaryEvidence: ["review-text.md"],
    },
  });
  fs.mkdirSync(path.join(fixture.studentsDir, "20230002-Beta Student"), { recursive: true });

  const result = resumeTask({ sessionPath: fixture.sessionPath });

  assert.equal(result.status, "resume_ready");
  assert.equal(result.nextActions.some((action) => action.includes("create-contact-sheet.cjs")), false);
  assert.equal(result.nextActions.some((action) => action.includes("build-assignment-review-text.cjs")), true);
  assert.equal(result.nextActions.some((action) => action.includes("prepare-evidence.cjs")), false);
});

test("resumeTask returns resume_ready for a valid bundle session", () => {
  const fixture = setupResumeFixture({ reviewMode: "bundle_zip", withEvidence: true });

  const result = resumeTask({ sessionPath: fixture.sessionPath });

  assert.equal(result.status, "resume_ready");
  assert.equal(result.reviewMode, "bundle_zip");
  assert.equal(result.nextStudentKey, "20230001");
  assert.equal(result.currentReviewState.evidenceReady, true);
  assert.deepEqual(result.missingPaths, []);
});

test("resumeTask treats students with only draftReviews as pending", () => {
  const fixture = setupResumeFixture({ reviewMode: "bundle_zip", withEvidence: true });
  upsertDraftReviews({
    resultPath: fixture.resultPath,
    assignmentName: fixture.assignmentName,
    drafts: [{
      studentName: "Alpha Student",
      studentKey: "20230001",
      suggestedScore: 84,
      comment: "The visible work is mostly complete and readable.",
    }],
  });

  const result = resumeTask({ sessionPath: fixture.sessionPath });

  assert.equal(result.status, "resume_ready");
  assert.equal(result.nextStudentKey, "20230001");
  assert.equal(result.completedCount, 0);
});

test("resumeTask restores formal reviews while keeping draft-only students pending", () => {
  const fixture = setupResumeFixture({
    reviewMode: "bundle_zip",
    withEvidence: true,
    students: [
      { studentName: "Beta Student", studentKey: "20230002", statusAtImport: "pending" },
      { studentName: "Alpha Student", studentKey: "20230001", statusAtImport: "pending" },
    ],
  });
  upsertDraftReviews({
    resultPath: fixture.resultPath,
    assignmentName: fixture.assignmentName,
    drafts: [{
      studentName: "Alpha Student",
      studentKey: "20230001",
      suggestedScore: 84,
      comment: "The visible work is mostly complete and readable.",
    }],
  });
  appendStudentReview({
    resultPath: fixture.resultPath,
    assignmentName: fixture.assignmentName,
    review: { studentName: "Beta Student", studentKey: "20230002", status: "reviewed", suggestedScore: 86 },
  });

  const result = resumeTask({ sessionPath: fixture.sessionPath });

  assert.equal(result.status, "resume_ready");
  assert.equal(result.nextStudentKey, "20230001");
});

test("resumeTask blocks bundle sessions before website-completed sync decision", () => {
  const fixture = setupResumeFixture({ reviewMode: "bundle_zip", withEvidence: true });
  initSession({
    sessionPath: fixture.sessionPath,
    courseName: "Course A",
    assignmentName: fixture.assignmentName,
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    status: "needs_bundle_completed_sync_decision",
    rubricPath: fixture.rubricPath,
    resultPath: fixture.resultPath,
    reviewSourcePath: fixture.workDir,
    studentIndexPath: fixture.studentIndexPath,
    sourceZip: fixture.sourceZip,
    studentsDir: fixture.studentsDir,
    currentStudentKey: "20230001",
  });

  const result = resumeTask({ sessionPath: fixture.sessionPath });

  assert.equal(result.status, "needs_user_action");
  assert.equal(result.issues[0].code, "pending_completed_sync_decision");
  assert.equal(result.currentReviewState, null);
  assert.equal(result.nextActions.some((action) => action.includes("mark-completed-sync-decision")), true);
});

test("resumeTask blocks sessions before skipped-student decision", () => {
  const fixture = setupResumeFixture({ reviewMode: "bundle_zip", withEvidence: true });
  initSession({
    sessionPath: fixture.sessionPath,
    courseName: "Course A",
    assignmentName: fixture.assignmentName,
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    status: "needs_skipped_decision",
    completedSyncDecision: "no",
    rubricPath: fixture.rubricPath,
    resultPath: fixture.resultPath,
    reviewSourcePath: fixture.workDir,
    studentIndexPath: fixture.studentIndexPath,
    sourceZip: fixture.sourceZip,
    studentsDir: fixture.studentsDir,
    currentStudentKey: "20230001",
  });

  const result = resumeTask({ sessionPath: fixture.sessionPath });

  assert.equal(result.status, "needs_user_action");
  assert.equal(result.issues[0].code, "pending_skipped_decision");
  assert.equal(result.currentReviewState, null);
  assert.equal(result.nextActions.some((action) => action.includes("apply-skipped-students.cjs")), true);
});

test("resumeTask does not repeat bundle completed-sync prompt when result already has reviews", () => {
  const fixture = setupResumeFixture({ reviewMode: "bundle_zip", withEvidence: true });
  appendStudentReview({
    resultPath: fixture.resultPath,
    assignmentName: fixture.assignmentName,
    review: { studentName: "Alpha Student", studentKey: "20230001", status: "manual_review", statusReason: "checked_before_resume" },
  });
  initSession({
    sessionPath: fixture.sessionPath,
    courseName: "Course A",
    assignmentName: fixture.assignmentName,
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    status: "needs_bundle_completed_sync_decision",
    rubricPath: fixture.rubricPath,
    resultPath: fixture.resultPath,
    reviewSourcePath: fixture.workDir,
    studentIndexPath: fixture.studentIndexPath,
    sourceZip: fixture.sourceZip,
    studentsDir: fixture.studentsDir,
    currentStudentKey: "20230001",
    completedStudentKeys: [],
  });

  const result = resumeTask({ sessionPath: fixture.sessionPath });

  assert.equal(result.status, "complete");
  assert.equal(result.issues.some((issue) => issue.code === "pending_completed_sync_decision"), false);
});

test("resumeTask does not repeat skipped prompt when result already has reviews", () => {
  const fixture = setupResumeFixture({ reviewMode: "bundle_zip", withEvidence: true });
  appendStudentReview({
    resultPath: fixture.resultPath,
    assignmentName: fixture.assignmentName,
    review: { studentName: "Alpha Student", studentKey: "20230001", status: "reviewed", suggestedScore: 86 },
  });
  initSession({
    sessionPath: fixture.sessionPath,
    courseName: "Course A",
    assignmentName: fixture.assignmentName,
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    status: "needs_skipped_decision",
    completedSyncDecision: "no",
    rubricPath: fixture.rubricPath,
    resultPath: fixture.resultPath,
    reviewSourcePath: fixture.workDir,
    studentIndexPath: fixture.studentIndexPath,
    sourceZip: fixture.sourceZip,
    studentsDir: fixture.studentsDir,
    currentStudentKey: "20230001",
    completedStudentKeys: [],
  });

  const result = resumeTask({ sessionPath: fixture.sessionPath });

  assert.equal(result.status, "complete");
  assert.equal(result.issues.some((issue) => issue.code === "pending_skipped_decision"), false);
});

test("resumeTask reports invalid_session when the task session is missing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-resume-missing-session-"));

  const result = resumeTask({ sessionPath: path.join(root, "tmp", "session", "fanya-current-task.json") });

  assert.equal(result.status, "invalid_session");
  assert.equal(result.issues[0].code, "missing_session");
});

test("resumeTask blocks when the result record is missing", () => {
  const fixture = setupResumeFixture({ reviewMode: "bundle_zip" });
  fs.rmSync(fixture.resultPath);

  const result = resumeTask({ sessionPath: fixture.sessionPath });

  assert.equal(result.status, "blocked");
  assert.equal(result.issues.some((issue) => issue.code === "missing_result"), true);
});

test("resumeTask asks for user action when the rubric is missing", () => {
  const fixture = setupResumeFixture({ reviewMode: "bundle_zip" });
  fs.rmSync(fixture.rubricPath);

  const result = resumeTask({ sessionPath: fixture.sessionPath });

  assert.equal(result.status, "needs_user_action");
  assert.equal(result.issues.some((issue) => issue.code === "missing_rubric"), true);
});

test("resumeTask can rebuild bundle when local students are missing but source zip exists", () => {
  const fixture = setupResumeFixture({ reviewMode: "bundle_zip" });
  fs.rmSync(fixture.workDir, { recursive: true, force: true });

  const result = resumeTask({ sessionPath: fixture.sessionPath });

  assert.equal(result.status, "can_rebuild_bundle");
  assert.equal(result.canRepair, true);
  assert.equal(result.repairSuggestion.kind, "reimport_bundle");
});

test("resumeTask asks for the bundle zip when bundle files and source zip are missing", () => {
  const fixture = setupResumeFixture({ reviewMode: "bundle_zip" });
  fs.rmSync(fixture.workDir, { recursive: true, force: true });
  fs.rmSync(fixture.sourceZip);

  const result = resumeTask({ sessionPath: fixture.sessionPath });

  assert.equal(result.status, "needs_user_action");
  assert.equal(result.issues.some((issue) => issue.code === "missing_bundle_zip"), true);
});

test("resumeTask can rebuild web index when web student index is missing", () => {
  const fixture = setupResumeFixture({ reviewMode: "web_download" });
  fs.rmSync(fixture.studentIndexPath);

  const result = resumeTask({ sessionPath: fixture.sessionPath });

  assert.equal(result.status, "can_rebuild_web_index");
  assert.equal(result.repairSuggestion.kind, "rebuild_web_roster");
});

test("resumeTask returns browser download actions for web student without evidence", () => {
  const fixture = setupResumeFixture({ reviewMode: "web_download" });

  const result = resumeTask({ sessionPath: fixture.sessionPath });

  assert.equal(result.status, "resume_ready");
  assert.equal(result.reviewMode, "web_download");
  assert.equal(result.currentReviewState.needsBrowserReviewPage, true);
  assert.equal(result.nextActions.some((action) => action.includes("webReviewUrl")), true);
});

test("resumeTask returns complete when all indexed students are handled", () => {
  const fixture = setupResumeFixture({ reviewMode: "bundle_zip" });
  appendStudentReview({
    resultPath: fixture.resultPath,
    assignmentName: fixture.assignmentName,
    review: { studentName: "Alpha Student", studentKey: "20230001", status: "reviewed", suggestedScore: 88 },
  });
  initSession({
    sessionPath: fixture.sessionPath,
    courseName: "Course A",
    assignmentName: fixture.assignmentName,
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    status: "reviewing_students",
    rubricPath: fixture.rubricPath,
    resultPath: fixture.resultPath,
    reviewSourcePath: fixture.workDir,
    studentIndexPath: fixture.studentIndexPath,
    sourceZip: fixture.sourceZip,
    studentsDir: fixture.studentsDir,
    currentStudentKey: null,
    completedStudentKeys: ["20230001"],
    skippedStudentKeys: [],
  });

  const result = resumeTask({ sessionPath: fixture.sessionPath });

  assert.equal(result.status, "complete");
  assert.equal(result.nextStudentKey, null);
  assert.equal(result.nextActions.some((action) => action.includes("export-result-xlsx.cjs") && action.includes("--dry-run")), true);
  assert.equal(result.nextActions.some((action) => action.includes("export-result-xlsx.cjs") && !action.includes("--dry-run")), true);
});
