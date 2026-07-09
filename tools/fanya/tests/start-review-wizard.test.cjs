const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { startReviewWizard } = require("../scripts/start-review-wizard.cjs");
const { createResultRecordFile, createRubricRecordFile, loadRecord, saveRecord } = require("../scripts/record-store.cjs");
const { saveStudentIndex } = require("../scripts/student-index.cjs");
const { initSession } = require("../scripts/task-session.cjs");

const WIZARD_SCRIPT = path.join(__dirname, "..", "scripts", "start-review-wizard.cjs");

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "fanya-wizard-"));
}

function createReadyInputs(root, reviewMode = "bundle_zip") {
  const rubricPath = createRubricRecordFile({
    rubricPath: path.join(root, "rubric.cjs"),
    courseName: "Course A",
    assignmentName: "Assignment A",
    status: "confirmed",
  });
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course A",
    assignmentName: "Assignment A",
    rubricPath,
  });
  const studentIndexPath = path.join(root, "student-index.json");
  saveStudentIndex({
    indexPath: studentIndexPath,
    reviewMode,
    source: "test",
    courseName: "Course A",
    assignmentName: "Assignment A",
    students: [
      { studentName: "Learner One", studentKey: "local-001", statusAtImport: "pending" },
      { studentName: "Learner Two", studentKey: "local-002", statusAtImport: "pending" },
    ],
  });

  return {
    reviewMode,
    courseName: "Course A",
    assignmentName: "Assignment A",
    rubricPath,
    resultPath,
    studentIndexPath,
  };
}

function createReadyInputsWithRubricPriority(root, reviewPriority, reviewMode = "bundle_zip") {
  const inputs = createReadyInputs(root, reviewMode);
  const rubric = loadRecord(inputs.rubricPath);
  saveRecord(inputs.rubricPath, { ...rubric, reviewPriority });
  return inputs;
}

test("wizard blocks student review when rubric is missing", () => {
  const root = makeRoot();
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course A",
    assignmentName: "Assignment A",
  });

  const result = startReviewWizard({
    reviewMode: "web_download",
    courseName: "Course A",
    assignmentName: "Assignment A",
    resultPath,
    rubricPath: path.join(root, "missing-rubric.cjs"),
  });

  assert.equal(result.status, "needs_rubric");
  assert.equal(result.phase, "rubric_resolution");
  assert.equal(result.canReviewStudents, false);
  assert.equal(result.requiredUserAction, "create_or_select_rubric");
  assert.ok(result.blockedActions.includes("review_students"));
});

test("wizard blocks student review when rubric is not confirmed", () => {
  const root = makeRoot();
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course A",
    assignmentName: "Assignment A",
  });
  const rubricPath = createRubricRecordFile({
    rubricPath: path.join(root, "rubric.cjs"),
    courseName: "Course A",
    assignmentName: "Assignment A",
    status: "draft",
  });

  const result = startReviewWizard({
    reviewMode: "web_download",
    courseName: "Course A",
    assignmentName: "Assignment A",
    resultPath,
    rubricPath,
  });

  assert.equal(result.status, "needs_rubric_confirmation");
  assert.equal(result.phase, "rubric_resolution");
  assert.equal(result.requiredUserAction, "confirm_rubric");
  assert.deepEqual(result.allowedActions, ["show_rubric_to_user", "confirm_rubric"]);
  assert.ok(result.blockedActions.includes("record_review"));
});

test("wizard blocks student review when result record is missing", () => {
  const root = makeRoot();
  const rubricPath = createRubricRecordFile({
    rubricPath: path.join(root, "rubric.cjs"),
    courseName: "Course A",
    assignmentName: "Assignment A",
    status: "confirmed",
  });

  const result = startReviewWizard({
    reviewMode: "web_download",
    courseName: "Course A",
    assignmentName: "Assignment A",
    rubricPath,
    resultPath: path.join(root, "missing-result.cjs"),
  });

  assert.equal(result.status, "needs_result");
  assert.equal(result.phase, "result_resolution");
  assert.equal(result.canReviewStudents, false);
  assert.equal(result.requiredUserAction, "create_or_select_result");
});

test("wizard blocks student review when student index is missing", () => {
  const root = makeRoot();
  const rubricPath = createRubricRecordFile({
    rubricPath: path.join(root, "rubric.cjs"),
    courseName: "Course A",
    assignmentName: "Assignment A",
    status: "confirmed",
  });
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course A",
    assignmentName: "Assignment A",
    rubricPath,
  });

  const result = startReviewWizard({
    reviewMode: "bundle_zip",
    courseName: "Course A",
    assignmentName: "Assignment A",
    rubricPath,
    resultPath,
    studentIndexPath: path.join(root, "missing-student-index.json"),
  });

  assert.equal(result.status, "needs_student_index");
  assert.equal(result.phase, "student_index_resolution");
  assert.equal(result.canReviewStudents, false);
  assert.equal(result.requiredUserAction, "create_student_index");
});

test("wizard context guidance points to direct Chaoxing entry", () => {
  const result = startReviewWizard({ reviewMode: "bundle_zip" });

  assert.equal(result.status, "needs_context");
  assert.equal(result.notes.some((note) => note.includes("https://i.chaoxing.com/")), true);
});

test("wizard blocks student review until skipped students are confirmed", () => {
  const root = makeRoot();
  const inputs = createReadyInputs(root, "web_download");

  const result = startReviewWizard(inputs);

  assert.equal(result.status, "needs_skipped_decision");
  assert.equal(result.phase, "skipped_resolution");
  assert.equal(result.canReviewStudents, false);
  assert.equal(result.requiredUserAction, "ask_for_skipped_students");
});

test("wizard allows student review after skipped students are resolved", () => {
  const root = makeRoot();
  const inputs = createReadyInputs(root, "bundle_zip");

  const result = startReviewWizard({
    ...inputs,
    skippedDecision: "done",
  });

  assert.equal(result.status, "ready_to_review");
  assert.equal(result.phase, "student_review");
  assert.equal(result.canReviewStudents, true);
  assert.deepEqual(result.blockedActions, []);
});

test("wizard recommends bundle fast review preparation commands when ready", () => {
  const root = makeRoot();
  const inputs = createReadyInputs(root, "bundle_zip");

  const result = startReviewWizard({
    ...inputs,
    skippedDecision: "none",
  });

  assert.equal(result.status, "ready_to_review");
  assert.equal(result.recommendedCommands.some((command) => command.includes("prepare-bundle-evidence.cjs")), true);
  assert.equal(result.recommendedCommands.some((command) => command.includes("create-contact-sheet.cjs")), true);
  assert.equal(result.recommendedCommands.some((command) => command.includes("create-contact-sheet.cjs") && command.includes("--session-path")), true);
  assert.equal(result.notes.some((note) => note.includes("bundle_zip defaults to fast_bundle")), true);
  assert.equal(result.notes.some((note) => note.includes("Do not ask a separate fast-review question")), true);
  assert.equal(result.notes.some((note) => note.includes("pure text/document assignments use assignment-review-text.md")), true);
});

test("wizard derives contact sheet video options from the confirmed rubric", () => {
  const root = makeRoot();
  const inputs = createReadyInputsWithRubricPriority(root, {
    recommendedMode: "fast_bundle",
    suitableFor: ["video"],
    representativeMediaRules: { videoFrameCount: 8 },
  }, "bundle_zip");

  const result = startReviewWizard({
    ...inputs,
    skippedDecision: "none",
  });

  const contactSheetCommand = result.recommendedCommands.find((command) => command.includes("create-contact-sheet.cjs"));
  assert.equal(result.status, "ready_to_review");
  assert.match(contactSheetCommand, /--mode video-first/);
  assert.match(contactSheetCommand, /--slots 8/);
});

test("wizard recommends assignment text bundle instead of contact sheet for pure text rubrics", () => {
  const root = makeRoot();
  const inputs = createReadyInputsWithRubricPriority(root, {
    recommendedMode: "fast_bundle",
    suitableFor: ["text_document"],
    primaryEvidence: ["review-text.md"],
  }, "bundle_zip");

  const result = startReviewWizard({
    ...inputs,
    skippedDecision: "none",
  });

  assert.equal(result.status, "ready_to_review");
  assert.equal(result.recommendedCommands.some((command) => command.includes("build-assignment-review-text.cjs")), true);
  assert.equal(result.recommendedCommands.some((command) => command.includes("create-contact-sheet.cjs")), false);
});

test("wizard recommends both assignment text bundle and contact sheet for mixed document visual rubrics", () => {
  const root = makeRoot();
  const inputs = createReadyInputsWithRubricPriority(root, {
    recommendedMode: "fast_bundle",
    suitableFor: ["mixed_doc_visual"],
    primaryEvidence: ["review-text.md", "final image"],
  }, "bundle_zip");

  const result = startReviewWizard({
    ...inputs,
    skippedDecision: "none",
  });

  assert.equal(result.status, "ready_to_review");
  assert.equal(result.recommendedCommands.some((command) => command.includes("build-assignment-review-text.cjs")), true);
  assert.equal(result.recommendedCommands.some((command) => command.includes("create-contact-sheet.cjs")), true);
});

test("wizard detects an existing session before starting a new setup", () => {
  const root = makeRoot();
  const sessionPath = path.join(root, "session.json");
  initSession({
    sessionPath,
    reviewMode: "web_download",
    courseName: "Course A",
    assignmentName: "Assignment A",
    rubricPath: path.join(root, "rubric.cjs"),
    resultPath: path.join(root, "result.cjs"),
    studentIndexPath: path.join(root, "student-index.json"),
    studentsDir: path.join(root, "students"),
    completedStudentKeys: ["local-001"],
    skippedStudentKeys: ["local-002"],
  });

  const result = startReviewWizard({ sessionPath });

  assert.equal(result.status, "resume_or_repair");
  assert.equal(result.phase, "resume_resolution");
  assert.equal(result.canReviewStudents, false);
  assert.equal(result.reviewMode, "web_download");
  assert.equal(result.courseName, "Course A");
  assert.equal(result.assignmentName, "Assignment A");
  assert.deepEqual(result.completedStudentKeys, ["local-001"]);
  assert.deepEqual(result.skippedStudentKeys, ["local-002"]);
  assert.equal(result.notes.some((note) => note.includes("For a fresh new run")), true);
});

test("wizard blocks bundle review until website-completed sync is decided", () => {
  const root = makeRoot();
  const sessionPath = path.join(root, "session.json");
  initSession({
    sessionPath,
    reviewMode: "bundle_zip",
    courseName: "Course A",
    assignmentName: "Assignment A",
    rubricPath: path.join(root, "rubric.cjs"),
    resultPath: path.join(root, "result.cjs"),
    studentIndexPath: path.join(root, "student-index.json"),
    studentsDir: path.join(root, "students"),
    status: "needs_bundle_completed_sync_decision",
  });

  const result = startReviewWizard({ sessionPath });

  assert.equal(result.status, "needs_completed_sync_decision");
  assert.equal(result.phase, "completed_sync_resolution");
  assert.equal(result.canReviewStudents, false);
  assert.equal(result.requiredUserAction, "ask_bundle_completed_sync");
  assert.ok(result.allowedActions.includes("sync_bundle_web_completed"));
  assert.ok(result.allowedActions.includes("decline_bundle_web_completed_sync"));
});

test("wizard asks for skipped students after bundle completed-sync decision", () => {
  const root = makeRoot();
  const sessionPath = path.join(root, "session.json");
  initSession({
    sessionPath,
    reviewMode: "bundle_zip",
    courseName: "Course A",
    assignmentName: "Assignment A",
    rubricPath: path.join(root, "rubric.cjs"),
    resultPath: path.join(root, "result.cjs"),
    studentIndexPath: path.join(root, "student-index.json"),
    studentsDir: path.join(root, "students"),
    status: "needs_skipped_decision",
    completedSyncDecision: "no",
  });

  const result = startReviewWizard({ sessionPath });

  assert.equal(result.status, "needs_skipped_decision");
  assert.equal(result.phase, "skipped_resolution");
  assert.equal(result.requiredUserAction, "ask_for_skipped_students");
});

test("wizard CLI prints status JSON", () => {
  const output = execFileSync(process.execPath, [WIZARD_SCRIPT, "status"], { encoding: "utf8" });
  const result = JSON.parse(output);

  assert.equal(result.status, "needs_mode");
  assert.equal(result.canReviewStudents, false);
});

test("wizard CLI accepts setup paths and prints ready status", () => {
  const root = makeRoot();
  const inputs = createReadyInputs(root, "bundle_zip");

  const output = execFileSync(process.execPath, [
    WIZARD_SCRIPT,
    "status",
    "--mode",
    "bundle_zip",
    "--course-name",
    inputs.courseName,
    "--assignment-name",
    inputs.assignmentName,
    "--rubric-path",
    inputs.rubricPath,
    "--result-path",
    inputs.resultPath,
    "--student-index-path",
    inputs.studentIndexPath,
    "--skipped-decision",
    "none",
  ], { encoding: "utf8" });
  const result = JSON.parse(output);

  assert.equal(result.status, "ready_to_review");
  assert.equal(result.canReviewStudents, true);
});
