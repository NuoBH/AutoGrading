const fs = require("node:fs");

const { contactSheetOptionArgs, contactSheetOptionsFromRubric } = require("./contact-sheet-options.cjs");
const { RESULT_KIND, RUBRIC_KIND, loadRecord } = require("./record-store.cjs");

function startReviewWizard(options = {}) {
  const context = normalizeOptions(options);
  if (!context.ignoreSession && context.sessionPath && fs.existsSync(context.sessionPath)) {
    const session = readJson(context.sessionPath);
    if (session.status === "needs_bundle_completed_sync_decision") return needsCompletedSyncDecision(sessionContext(context, session));
    if (session.status === "needs_skipped_decision") return needsSkippedDecision(sessionContext(context, session));
    return resumeOrRepair(context, session);
  }
  if (!context.reviewMode) return needsMode(context);
  if (!["web_download", "bundle_zip"].includes(context.reviewMode)) {
    return invalid(context, "invalid_review_mode", `Unsupported reviewMode: ${context.reviewMode}`);
  }
  if (!context.courseName || !context.assignmentName) return needsContext(context);
  if (!context.rubricPath || !fs.existsSync(context.rubricPath)) return needsRubric(context);

  const rubric = loadRecord(context.rubricPath);
  if (rubric.kind !== RUBRIC_KIND) return invalid(context, "invalid_rubric", "rubricPath is not a fanya_rubric record");
  if (rubric.status !== "confirmed") return needsRubricConfirmation(context);

  if (!context.resultPath || !fs.existsSync(context.resultPath)) return needsResult(context);
  const result = loadRecord(context.resultPath);
  if (result.kind !== RESULT_KIND) return invalid(context, "invalid_result", "resultPath is not a fanya_result record");

  if (!context.studentIndexPath || !fs.existsSync(context.studentIndexPath)) return needsStudentIndex(context);

  if (["done", "none"].includes(context.skippedDecision)) return readyToReview(context);
  return needsSkippedDecision(context);
}

function normalizeOptions(options) {
  return {
    reviewMode: options.reviewMode || options.mode || "",
    courseName: options.courseName || options.course || "",
    assignmentName: options.assignmentName || options.assignment || "",
    rubricPath: options.rubricPath || "",
    resultPath: options.resultPath || "",
    sessionPath: options.sessionPath || "",
    studentIndexPath: options.studentIndexPath || "",
    skippedDecision: options.skippedDecision || "",
    ignoreSession: Boolean(options.ignoreSession),
  };
}

function base(context) {
  return {
    schemaVersion: 1,
    reviewMode: context.reviewMode || null,
    courseName: context.courseName || "",
    assignmentName: context.assignmentName || "",
    rubricPath: context.rubricPath || "",
    resultPath: context.resultPath || "",
    sessionPath: context.sessionPath || "",
    studentIndexPath: context.studentIndexPath || "",
  };
}

function needsMode(context) {
  return {
    ...base(context),
    status: "needs_mode",
    phase: "start",
    canReviewStudents: false,
    requiredUserAction: "choose_review_mode",
    allowedActions: ["choose_web_download", "choose_bundle_zip"],
    blockedActions: reviewBlockedActions(),
    requiredCommands: [],
    recommendedCommands: [
      `node tools/fanya/scripts/start-review-wizard.cjs status --mode web_download --session-path "${context.sessionPath || "tmp/session/fanya-current-task.json"}"`,
      `node tools/fanya/scripts/start-review-wizard.cjs status --mode bundle_zip --session-path "${context.sessionPath || "tmp/session/fanya-current-task.json"}"`,
    ],
    issues: [issue("missing_review_mode", "Choose web_download or bundle_zip before continuing.")],
    notes: ["Mode is passed with --mode; there is no choose-bundle-zip subcommand."],
  };
}

function needsContext(context) {
  return {
    ...base(context),
    status: "needs_context",
    phase: "context_resolution",
    canReviewStudents: false,
    requiredUserAction: "resolve_course_and_assignment",
    allowedActions: ["select_existing_rubric_or_result", "open_course_and_assignment"],
    blockedActions: reviewBlockedActions(),
    requiredCommands: [],
    recommendedCommands: [],
    issues: [issue("missing_context", "courseName and assignmentName are required before review setup.")],
    notes: ["When website context is required, open https://i.chaoxing.com/ first, let the user log in, then enter 课程. Use the school portal only as fallback."],
  };
}

function needsRubric(context) {
  return {
    ...base(context),
    status: "needs_rubric",
    phase: "rubric_resolution",
    canReviewStudents: false,
    requiredUserAction: "create_or_select_rubric",
    allowedActions: ["select_existing_rubric", "open_assignment_description", "draft_rubric"],
    blockedActions: reviewBlockedActions(),
    requiredCommands: [],
    recommendedCommands: [],
    issues: [issue("missing_rubric", "A rubric .cjs record is required before student review.")],
    notes: ["If creating a new rubric, include reviewPriority, show it to the user, and wait for confirmation."],
  };
}

function needsRubricConfirmation(context) {
  return {
    ...base(context),
    status: "needs_rubric_confirmation",
    phase: "rubric_resolution",
    canReviewStudents: false,
    requiredUserAction: "confirm_rubric",
    allowedActions: ["show_rubric_to_user", "confirm_rubric"],
    blockedActions: reviewBlockedActions(),
    requiredCommands: [],
    recommendedCommands: [],
    issues: [issue("rubric_not_confirmed", "Rubric exists but is not confirmed.")],
    notes: [],
  };
}

function needsResult(context) {
  return {
    ...base(context),
    status: "needs_result",
    phase: "result_resolution",
    canReviewStudents: false,
    requiredUserAction: "create_or_select_result",
    allowedActions: ["create_result", "select_existing_result"],
    blockedActions: reviewBlockedActions(),
    requiredCommands: [],
    recommendedCommands: [
      `node tools/fanya/scripts/create-result.cjs --course "${context.courseName}" --assignment "${context.assignmentName}" --rubric-path "${context.rubricPath}"`,
    ],
    issues: [issue("missing_result", "Result record is required before student review.")],
    notes: [],
  };
}

function needsStudentIndex(context) {
  return {
    ...base(context),
    status: "needs_student_index",
    phase: "student_index_resolution",
    canReviewStudents: false,
    requiredUserAction: "create_student_index",
    allowedActions: ["capture_web_roster", "import_bundle"],
    blockedActions: reviewBlockedActions(),
    requiredCommands: [],
    recommendedCommands: [],
    issues: [issue("missing_student_index", "Student index is required before skipped-student matching and review.")],
    notes: [],
  };
}

function needsSkippedDecision(context) {
  return {
    ...base(context),
    status: "needs_skipped_decision",
    phase: "skipped_resolution",
    canReviewStudents: false,
    requiredUserAction: "ask_for_skipped_students",
    allowedActions: ["match_skipped_students", "confirm_no_skipped_students"],
    blockedActions: reviewBlockedActions(),
    requiredCommands: [],
    recommendedCommands: [],
    issues: [issue("missing_skipped_decision", "Ask whether any students should be skipped before student review.")],
    notes: [],
  };
}

function needsCompletedSyncDecision(context) {
  return {
    ...base(context),
    status: "needs_completed_sync_decision",
    phase: "completed_sync_resolution",
    canReviewStudents: false,
    requiredUserAction: "ask_bundle_completed_sync",
    allowedActions: ["sync_bundle_web_completed", "decline_bundle_web_completed_sync"],
    blockedActions: reviewBlockedActions(),
    requiredCommands: [],
    recommendedCommands: [
      `node tools/fanya/scripts/sync-bundle-web-completed-flow.cjs --session <browser-session> --student-index "${context.studentIndexPath}" --result-path "${context.resultPath}" --assignment "${context.assignmentName}" --session-path "${context.sessionPath}"`,
      `node tools/fanya/scripts/task-session.cjs mark-completed-sync-decision --session-path "${context.sessionPath}" --decision no`,
    ],
    issues: [issue("missing_completed_sync_decision", "Ask whether to read the website roster and mark already-reviewed students before skipped-student selection.")],
    notes: ["This gate applies to bundle_zip mode after bundle import."],
  };
}

function readyToReview(context) {
  const commands = [
    `node tools/fanya/scripts/current-review-state.cjs --session-path "${context.sessionPath || "tmp/session/fanya-current-task.json"}"`,
  ];
  if (context.reviewMode === "bundle_zip") {
    const contactSheetArgs = contactSheetArgsForRubric(context.rubricPath);
    commands.unshift(
      `node tools/fanya/scripts/prepare-bundle-evidence.cjs "<students-dir>" --session-path "${context.sessionPath || "tmp/session/fanya-current-task.json"}" --summary-only --json-out "<work-dir>/prepared-bundle-evidence.json"`,
      `node tools/fanya/scripts/create-contact-sheet.cjs --students-dir "<students-dir>" --session-path "${context.sessionPath || "tmp/session/fanya-current-task.json"}" --out "<work-dir>/contact-sheet.svg" --map-out "<work-dir>/contact-sheet.json" --notes-out "tmp/session/contact-sheet-review-notes.json" --rubric-path "${context.rubricPath}"${contactSheetArgs ? ` ${contactSheetArgs}` : ""}`,
      `node tools/fanya/scripts/promote-draft-reviews.cjs --result-path "${context.resultPath}" --assignment "${context.assignmentName}" --session-path "${context.sessionPath || "tmp/session/fanya-current-task.json"}" --notes-path "tmp/session/contact-sheet-review-notes.json" --dry-run`,
    );
  }
  return {
    ...base(context),
    status: "ready_to_review",
    phase: "student_review",
    canReviewStudents: true,
    requiredUserAction: "review_next_student",
    allowedActions: ["prepare_evidence", "review_students", "record_review"],
    blockedActions: [],
    requiredCommands: [],
    recommendedCommands: commands,
    issues: [],
    notes: [
      "Use student index and session state to choose the next unhandled student.",
      "bundle_zip defaults to fast_bundle when the confirmed rubric recommends it. Do not ask a separate fast-review question.",
      "Use contact-sheet drafts only for suitable visual/video/pdf/image/mixed assignments; pure text/document assignments use review-text.md primaryFiles.",
      "The create-contact-sheet command derives --mode and --slots from the confirmed rubric when video-first or multi-slot evidence is configured.",
      "Promote draftReviews only after running the dry-run readiness summary and getting user confirmation.",
    ],
  };
}

function contactSheetArgsForRubric(rubricPath) {
  if (!rubricPath || !fs.existsSync(rubricPath)) return "";
  try {
    const rubric = loadRecord(rubricPath);
    return contactSheetOptionArgs(contactSheetOptionsFromRubric(rubric));
  } catch {
    return "";
  }
}

function resumeOrRepair(context, session = readJson(context.sessionPath)) {
  return {
    ...base({
      ...context,
      reviewMode: session.reviewMode || context.reviewMode,
      courseName: session.courseName || context.courseName,
      assignmentName: session.assignmentName || context.assignmentName,
      rubricPath: session.rubricPath || context.rubricPath,
      resultPath: session.resultPath || context.resultPath,
      studentIndexPath: session.studentIndexPath || context.studentIndexPath,
    }),
    status: "resume_or_repair",
    phase: "resume_resolution",
    canReviewStudents: false,
    requiredUserAction: "choose_resume_or_repair",
    allowedActions: ["resume_task", "repair_task", "clear_session_after_user_confirmation"],
    blockedActions: reviewBlockedActions(),
    requiredCommands: [],
    recommendedCommands: [
      `node tools/fanya/scripts/resume-task.cjs --session-path "${context.sessionPath}"`,
      `node tools/fanya/scripts/repair-task.cjs status --session-path "${context.sessionPath}"`,
    ],
    issues: [],
    notes: [
      "An existing task session was found. For resume triggers, run resume-task.cjs. For a fresh new run, ask the user before clearing or replacing the old session, then rerun the wizard.",
    ],
    completedStudentKeys: session.completedStudentKeys || [],
    skippedStudentKeys: session.skippedStudentKeys || [],
  };
}

function sessionContext(context, session) {
  return {
    ...context,
    reviewMode: session.reviewMode || context.reviewMode,
    courseName: session.courseName || context.courseName,
    assignmentName: session.assignmentName || context.assignmentName,
    rubricPath: session.rubricPath || context.rubricPath,
    resultPath: session.resultPath || context.resultPath,
    studentIndexPath: session.studentIndexPath || context.studentIndexPath,
  };
}

function invalid(context, code, message) {
  return {
    ...base(context),
    status: "invalid",
    phase: "start",
    canReviewStudents: false,
    requiredUserAction: "fix_invalid_input",
    allowedActions: [],
    blockedActions: reviewBlockedActions(),
    requiredCommands: [],
    recommendedCommands: [],
    issues: [issue(code, message)],
    notes: [],
  };
}

function issue(code, message, details = {}) {
  return { code, message, ...details };
}

function reviewBlockedActions() {
  return ["review_students", "prepare_evidence", "download_attachments", "record_review"];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

module.exports = {
  startReviewWizard,
};

function parseArgs(argv) {
  const args = { command: argv[2] || "status" };
  for (let index = 3; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--")) continue;
    if (key === "--ignore-session") {
      args.ignoreSession = true;
      continue;
    }
    args[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

function optionsFromArgs(args) {
  return {
    reviewMode: args.mode || args["review-mode"],
    courseName: args["course-name"] || args.course,
    assignmentName: args["assignment-name"] || args.assignment,
    rubricPath: args["rubric-path"],
    resultPath: args["result-path"],
    sessionPath: args["session-path"],
    studentIndexPath: args["student-index-path"],
    skippedDecision: args["skipped-decision"],
    ignoreSession: args.ignoreSession,
  };
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.command !== "status") {
    throw new Error("Usage: start-review-wizard.cjs status [--mode web_download|bundle_zip] [--course-name NAME] [--assignment-name NAME] [--rubric-path PATH] [--result-path PATH] [--student-index-path PATH] [--session-path PATH] [--skipped-decision done|none] [--ignore-session]");
  }
  process.stdout.write(`${JSON.stringify(startReviewWizard(optionsFromArgs(args)), null, 2)}\n`);
}

if (require.main === module) {
  try {
    main(process.argv);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
