const fs = require("node:fs");
const path = require("node:path");

const { sanitizePathPart } = require("./attachment-utils.cjs");
const { contactSheetOptionArgs, contactSheetOptionsFromRubric } = require("./contact-sheet-options.cjs");
const { currentReviewState } = require("./current-review-state.cjs");
const { extractCompletedStudentKeys, extractSkippedStudentKeys, loadRecord } = require("./record-store.cjs");
const { loadStudentIndex, studentKeysFromIndex } = require("./student-index.cjs");
const { DEFAULT_SESSION_PATH, loadSession, nextStudentKey } = require("./task-session.cjs");

const ARCHIVE_EXTENSIONS = new Set([".zip", ".7z", ".rar", ".tar", ".gz"]);

function resumeTask(options = {}) {
  const sessionPath = options.sessionPath || DEFAULT_SESSION_PATH;
  const cwd = options.cwd || process.cwd();
  const resolvedSessionPath = resolveFrom(cwd, sessionPath);
  const issues = [];
  const missingPaths = [];

  const sessionRead = readJsonFile(resolvedSessionPath);
  if (!sessionRead.ok) {
    return baseResult({
      status: "invalid_session",
      sessionPath,
      issues: [issue("missing_session", `Task session not found or unreadable: ${sessionPath}`, { path: sessionPath })],
      missingPaths: [sessionPath],
      nextActions: [
        "Start a new task or rebuild runtime state from an existing result record plus bundle import or web roster extraction.",
      ],
    });
  }

  const session = sessionRead.value;
  const reviewMode = session.reviewMode || "";
  if (!["bundle_zip", "web_download"].includes(reviewMode)) {
    return baseResult({
      status: "invalid_session",
      sessionPath,
      session,
      reviewMode,
      issues: [issue("invalid_review_mode", `Unsupported reviewMode: ${reviewMode || "(empty)"}`)],
      nextActions: ["Create a new session with reviewMode bundle_zip or web_download."],
    });
  }

  checkRequiredRecord({
    label: "result",
    code: "missing_result",
    recordPath: session.resultPath,
    cwd,
    issues,
    missingPaths,
    blocked: true,
  });
  checkRequiredRecord({
    label: "rubric",
    code: "missing_rubric",
    recordPath: session.rubricPath,
    cwd,
    issues,
    missingPaths,
  });

  const indexPath = session.studentIndexPath;
  const resolvedIndexPath = indexPath ? resolveFrom(cwd, indexPath) : "";
  const indexExists = !!resolvedIndexPath && fs.existsSync(resolvedIndexPath);
  let index = null;
  if (indexExists) {
    const indexRead = readJsonFile(resolvedIndexPath);
    if (indexRead.ok) index = indexRead.value;
    if (!indexRead.ok) issues.push(issue("invalid_student_index", `Student index is unreadable: ${indexPath}`, { path: indexPath }));
  } else {
    missingPaths.push(indexPath || "studentIndexPath");
    issues.push(issue("missing_student_index", `Student index is missing: ${indexPath || "(empty)"}`, { path: indexPath || "" }));
  }

  if (hasIssue(issues, "missing_result")) {
    return withCommonFields({
      status: "blocked",
      sessionPath,
      session,
      reviewMode,
      issues,
      missingPaths,
      nextActions: [
        "Provide the existing result .cjs file or explicitly start a new result before resuming.",
      ],
    });
  }

  if (hasIssue(issues, "missing_rubric")) {
    return withCommonFields({
      status: "needs_user_action",
      sessionPath,
      session,
      reviewMode,
      issues,
      missingPaths,
      nextActions: [
        "Provide the confirmed rubric .cjs path or regenerate and confirm the rubric before resuming.",
      ],
    });
  }

  if (!index) {
    if (reviewMode === "web_download") {
      return webIndexRebuildResult({ sessionPath, session, reviewMode, issues, missingPaths });
    }
    return bundleRebuildOrUserAction({ sessionPath, session, reviewMode, issues, missingPaths, cwd });
  }

  const indexValidation = validateStudentIndex({ session, index });
  issues.push(...indexValidation.issues);
  if (indexValidation.status) {
    return withCommonFields({
      status: indexValidation.status,
      sessionPath,
      session,
      reviewMode,
      studentIndexPath: indexPath,
      totalStudents: Array.isArray(index.students) ? index.students.length : null,
      issues,
      missingPaths,
      nextActions: indexValidation.nextActions,
    });
  }

  const setupStatus = pendingSetupStatusResult({ sessionPath, session, reviewMode, indexPath, index });
  if (setupStatus) return setupStatus;

  if (reviewMode === "bundle_zip") {
    const bundleIssue = bundlePathIssue({ session, cwd });
    if (bundleIssue) {
      issues.push(bundleIssue.issue);
      missingPaths.push(...bundleIssue.missingPaths);
      return bundleRebuildOrUserAction({ sessionPath, session, reviewMode, issues, missingPaths, cwd });
    }
  }

  let state = null;
  try {
    state = currentReviewState({ sessionPath: resolvedSessionPath });
  } catch (error) {
    return withCommonFields({
      status: "blocked",
      sessionPath,
      session,
      reviewMode,
      issues: issues.concat(issue("current_state_failed", error.message)),
      missingPaths,
      nextActions: ["Inspect the session and student index paths, then rerun resume-task.cjs."],
    });
  }

  const studentKeys = studentKeysFromIndex(index);
  const restoredSession = sessionWithResultHandledKeys(session);
  const nextKey = nextStudentKey(restoredSession, studentKeys);
  const useFastBundleBatchFirst = shouldUseFastBundleBatchFirst({
    session: restoredSession,
    studentCount: studentKeys.length,
  });
  if (!nextKey) {
    return withCommonFields({
      status: "complete",
      sessionPath,
      session,
      reviewMode,
      studentIndexPath: indexPath,
      totalStudents: studentKeys.length,
      nextStudentKey: null,
      currentReviewState: state,
      issues,
      missingPaths,
      nextActions: [
        `Run export-result-xlsx.cjs --result-path "${session.resultPath}" --out-dir "outputs" --dry-run.`,
        `Run export-result-xlsx.cjs --result-path "${session.resultPath}" --out-dir "outputs".`,
        "Run the appropriate cleanup script for the completed assignment, then clear the current task session.",
      ],
    });
  }

  return withCommonFields({
    status: "resume_ready",
    sessionPath,
    session,
      reviewMode,
      studentIndexPath: indexPath,
      totalStudents: studentKeys.length,
      nextStudentKey: nextKey,
    currentReviewState: state,
    issues,
    missingPaths,
    nextActions: nextActionsForReadyState(state, { fastBundleBatchFirst: useFastBundleBatchFirst }),
  });
}

function sessionWithResultHandledKeys(session) {
  if (!session.resultPath || !fs.existsSync(session.resultPath)) return session;
  const completed = extractCompletedStudentKeys({
    resultPath: session.resultPath,
    assignmentName: session.assignmentName,
  });
  const skipped = extractSkippedStudentKeys({
    resultPath: session.resultPath,
    assignmentName: session.assignmentName,
  });
  return {
    ...session,
    completedStudentKeys: unique([...(session.completedStudentKeys || []), ...completed]),
    skippedStudentKeys: unique([...(session.skippedStudentKeys || []), ...skipped]),
  };
}

function pendingSetupStatusResult({ sessionPath, session, reviewMode, indexPath, index }) {
  if (reviewMode === "bundle_zip" && resultHasAssignmentReviews(session)) return null;

  if (session.status === "needs_bundle_completed_sync_decision") {
    return withCommonFields({
      status: "needs_user_action",
      sessionPath,
      session,
      reviewMode,
      studentIndexPath: indexPath,
      totalStudents: Array.isArray(index.students) ? index.students.length : null,
      issues: [issue("pending_completed_sync_decision", "Bundle task is waiting for the website-completed sync decision.")],
      nextActions: [
        "Ask the user whether to read the website roster and mark already-reviewed students.",
        "If yes, open the assignment review list and run sync-bundle-web-completed-flow.cjs.",
        "If no, run task-session.cjs mark-completed-sync-decision --decision no.",
      ],
    });
  }

  if (session.status === "needs_skipped_decision") {
    return withCommonFields({
      status: "needs_user_action",
      sessionPath,
      session,
      reviewMode,
      studentIndexPath: indexPath,
      totalStudents: Array.isArray(index.students) ? index.students.length : null,
      issues: [issue("pending_skipped_decision", "Task is waiting for skipped-student confirmation.")],
      nextActions: [
        "Ask whether any students should be skipped.",
        "If yes, run apply-skipped-students.cjs with the matched names.",
        "If no students should be skipped, run task-session.cjs mark-skipped-decision --decision none before reviewing.",
      ],
    });
  }

  return null;
}

function resultHasAssignmentReviews(session) {
  if (!session.resultPath || !fs.existsSync(session.resultPath)) return false;
  try {
    const record = loadRecord(session.resultPath);
    const assignment = findAssignment(record, session.assignmentName);
    return (assignment?.reviews || []).some((review) => review.studentKey);
  } catch {
    return false;
  }
}

function shouldUseFastBundleBatchFirst({ session, studentCount }) {
  if (session.reviewMode !== "bundle_zip") return false;
  if (studentCount <= 1) return false;
  if (assignmentHasFormalReviewsOrActiveDrafts(session)) return false;
  const rubric = safeLoadRecord(session.rubricPath);
  const reviewPriority = rubric?.reviewPriority || {};
  if (reviewPriority.recommendedMode !== "fast_bundle") return false;
  return isContactSheetSuitable(reviewPriority);
}

function assignmentHasFormalReviewsOrActiveDrafts(session) {
  const result = safeLoadRecord(session.resultPath);
  const assignment = findAssignment(result, session.assignmentName);
  const hasFormalReviews = (assignment?.reviews || []).some((review) => review.studentKey);
  const hasActiveDrafts = (assignment?.draftReviews || []).some((draft) => draft.studentKey && draft.promoted !== true);
  return hasFormalReviews || hasActiveDrafts;
}

function isContactSheetSuitable(reviewPriority = {}) {
  const suitableFor = Array.isArray(reviewPriority.suitableFor)
    ? reviewPriority.suitableFor.map((item) => normalizeName(item))
    : [];
  if (suitableFor.length === 0) return true;
  return suitableFor.some((item) => /visual|image|video|pdf|mixed/.test(item));
}

function safeLoadRecord(recordPath) {
  if (!recordPath || !fs.existsSync(recordPath)) return null;
  try {
    return loadRecord(recordPath);
  } catch {
    return null;
  }
}

function findAssignment(record, assignmentName) {
  const target = normalizeName(assignmentName);
  return (record?.assignments || []).find((assignment) => normalizeName(assignment.assignmentName) === target) || null;
}

function validateStudentIndex({ session, index }) {
  const issues = [];
  if (!Array.isArray(index.students) || index.students.length === 0) {
    issues.push(issue("empty_student_index", "Student index has no students."));
  }

  const keys = (index.students || []).map((student) => student.studentKey).filter(Boolean);
  const duplicates = Array.from(new Set(keys.filter((key, indexOfKey) => keys.indexOf(key) !== indexOfKey)));
  if (duplicates.length > 0) {
    issues.push(issue("duplicate_student_keys", "Student index contains duplicate student keys.", { studentKeys: duplicates }));
  }

  if (index.reviewMode && session.reviewMode && index.reviewMode !== session.reviewMode) {
    issues.push(issue("student_index_mode_mismatch", "Student index reviewMode does not match session reviewMode.", {
      sessionReviewMode: session.reviewMode,
      indexReviewMode: index.reviewMode,
    }));
  }

  const contextMismatch = [];
  if (index.courseName && session.courseName && normalizeName(index.courseName) !== normalizeName(session.courseName)) {
    contextMismatch.push("courseName");
  }
  if (index.assignmentName && session.assignmentName && normalizeName(index.assignmentName) !== normalizeName(session.assignmentName)) {
    contextMismatch.push("assignmentName");
  }
  if (contextMismatch.length > 0) {
    issues.push(issue("student_index_context_mismatch", "Student index course or assignment does not match the current session.", {
      fields: contextMismatch,
    }));
  }

  if (issues.some((item) => ["empty_student_index", "duplicate_student_keys", "student_index_mode_mismatch"].includes(item.code))) {
    return {
      status: "blocked",
      issues,
      nextActions: [
        "Rebuild the student index from the original source before resuming.",
        "Do not continue grading until student keys and mode are unambiguous.",
      ],
    };
  }

  if (issues.some((item) => item.code === "student_index_context_mismatch")) {
    return {
      status: "needs_user_action",
      issues,
      nextActions: [
        "Confirm the selected course/assignment context or rebuild the student index for this task.",
      ],
    };
  }

  return { status: "", issues, nextActions: [] };
}

function checkRequiredRecord({ label, code, recordPath, cwd, issues, missingPaths }) {
  if (!recordPath || !fs.existsSync(resolveFrom(cwd, recordPath))) {
    issues.push(issue(code, `${label} record is missing: ${recordPath || "(empty)"}`, { path: recordPath || "" }));
    missingPaths.push(recordPath || `${label}Path`);
    return;
  }
  try {
    loadRecord(resolveFrom(cwd, recordPath));
  } catch (error) {
    issues.push(issue(`invalid_${label}`, `${label} record is unreadable: ${error.message}`, { path: recordPath }));
  }
}

function bundlePathIssue({ session, cwd }) {
  const missing = [];
  if (!session.reviewSourcePath || !fs.existsSync(resolveFrom(cwd, session.reviewSourcePath))) {
    missing.push(session.reviewSourcePath || "reviewSourcePath");
  }
  if (!session.studentsDir || !fs.existsSync(resolveFrom(cwd, session.studentsDir))) {
    missing.push(session.studentsDir || "studentsDir");
  }
  if (missing.length === 0) return null;
  return {
    issue: issue("missing_bundle_workdir", "Bundle extracted work directory or students directory is missing.", { paths: missing }),
    missingPaths: missing,
  };
}

function bundleRebuildOrUserAction({ sessionPath, session, reviewMode, issues, missingPaths, cwd }) {
  const sourceZipExists = !!session.sourceZip && fs.existsSync(resolveFrom(cwd, session.sourceZip));
  const candidates = findBundleCandidates({ cwd, assignmentName: session.assignmentName });

  if (sourceZipExists || candidates.length === 1) {
    return withCommonFields({
      status: "can_rebuild_bundle",
      sessionPath,
      session,
      reviewMode,
      issues,
      missingPaths,
      canRepair: true,
      repairSuggestion: {
        kind: "reimport_bundle",
        sourceZip: sourceZipExists ? session.sourceZip : candidates[0],
        command: `node tools/fanya/scripts/import-bundle.cjs --course "${session.courseName}" --assignment "${session.assignmentName}" --work-index ${session.localWorkIndex || "<index>"} --rubric-path "${session.rubricPath}" --result-path "${session.resultPath}"`,
      },
      nextActions: [
        "Ask the user to confirm reimporting the bundle zip before running import-bundle.cjs.",
        "After reimport, compare the regenerated student index with the current/previous student keys before grading.",
      ],
    });
  }

  const extraIssue = candidates.length > 1
    ? issue("multiple_bundle_candidates", "Multiple bundle archives match the assignment; ask the user to choose one.", { candidates })
    : issue("missing_bundle_zip", "Bundle zip is missing. Ask the user to place the assignment archive in tmp/bundle/.", { bundleDir: path.join("tmp", "bundle") });

  return withCommonFields({
    status: "needs_user_action",
    sessionPath,
    session,
    reviewMode,
    issues: issues.concat(extraIssue),
    missingPaths,
    canRepair: false,
    repairSuggestion: {
      kind: "provide_bundle_zip",
      bundleDir: path.join("tmp", "bundle"),
      candidates,
    },
    nextActions: [
      "Ask the user whether they have the bundle zip.",
      "If yes, place it in tmp/bundle/ and rerun resume-task.cjs.",
      "If no, resume cannot safely rebuild local bundle files.",
    ],
  });
}

function webIndexRebuildResult({ sessionPath, session, reviewMode, issues, missingPaths }) {
  return withCommonFields({
    status: "can_rebuild_web_index",
    sessionPath,
    session,
    reviewMode,
    issues,
    missingPaths,
    canRepair: false,
    repairSuggestion: {
      kind: "rebuild_web_roster",
      command: "Use browser navigation to enter the assignment review list, extract all roster pages, then rebuild tmp/session/fanya-current-student-index.json.",
    },
    nextActions: [
      "Ask the user to log in if needed and open the assignment review list.",
      "Extract all roster pages with the roster-page browser snippet.",
      "Restore completed/skipped keys from the result record before continuing.",
    ],
  });
}

function nextActionsForReadyState(state, { fastBundleBatchFirst = false } = {}) {
  if (fastBundleBatchFirst) {
    const workDir = state.reviewSourcePath || "<work-dir>";
    const studentsDir = state.studentsDir || "<students-dir>";
    const sessionPath = state.sessionPath || "tmp/session/fanya-current-task.json";
    const rubricPath = state.rubricPath || "<rubric.cjs>";
    const contactSheetArgs = contactSheetArgsForRubric(rubricPath);
    return [
      `Run prepare-bundle-evidence.cjs "${studentsDir}" --session-path "${sessionPath}" --summary-only --json-out "${path.join(workDir, "prepared-bundle-evidence.json")}".`,
      `Run create-contact-sheet.cjs --students-dir "${studentsDir}" --session-path "${sessionPath}" --out "${path.join(workDir, "contact-sheet.svg")}" --map-out "${path.join(workDir, "contact-sheet.json")}" --notes-out "tmp/session/contact-sheet-review-notes.json" --rubric-path "${rubricPath}"${contactSheetArgs ? ` ${contactSheetArgs}` : ""}.`,
      "Use the contact sheet to draft score/comment JSON for suitable students; record it with record-draft-reviews.cjs.",
      "Run promote-draft-reviews.cjs --dry-run and show the readiness summary to the user before promotion.",
    ];
  }
  if (state.reviewMode === "web_download" && state.needsBrowserReviewPage) {
    return [
      "Open currentReviewState.webReviewUrl in the active browser session.",
      "Run extract-attachments.browser.js on the student review page.",
      "Run web-download-student.cjs, download-attachments.cjs, then prepare-evidence.cjs.",
    ];
  }
  if (!state.evidenceReady && state.studentDir) {
    return [
      `Run prepare-evidence.cjs "${state.studentDir}".`,
      "Then open evidence/review-assets.json and review the listed evidence.",
    ];
  }
  if (state.evidenceReady) {
    return [
      "Open evidence/review-assets.json first.",
      "Review generated evidence and externalViewable files.",
      "Write the result with record-review.cjs.",
    ];
  }
  return ["Inspect currentReviewState output and restore missing local files before reviewing."];
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

function findBundleCandidates({ cwd, assignmentName }) {
  const bundleDir = resolveFrom(cwd, path.join("tmp", "bundle"));
  if (!fs.existsSync(bundleDir)) return [];
  const needle = normalizeName(assignmentName);
  return fs.readdirSync(bundleDir)
    .filter((name) => ARCHIVE_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .filter((name) => normalizeName(name).includes(needle))
    .map((name) => path.join("tmp", "bundle", name));
}

function normalizeName(value) {
  return sanitizePathPart(value || "").toLowerCase().replace(/\s+/g, "");
}

function readJsonFile(filePath) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(filePath, "utf8")) };
  } catch (error) {
    return { ok: false, error };
  }
}

function hasIssue(issues, code) {
  return issues.some((item) => item.code === code);
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function issue(code, message, details = {}) {
  return { code, message, ...details };
}

function baseResult(result) {
  return {
    status: result.status,
    sessionPath: result.sessionPath,
    reviewMode: result.reviewMode || null,
    issues: result.issues || [],
    missingPaths: result.missingPaths || [],
    nextActions: result.nextActions || [],
    canRepair: result.canRepair || false,
    repairSuggestion: result.repairSuggestion || null,
  };
}

function withCommonFields(result) {
  return {
    ...baseResult(result),
    courseName: result.session?.courseName || "",
    assignmentName: result.session?.assignmentName || "",
    resultPath: result.session?.resultPath || "",
    rubricPath: result.session?.rubricPath || "",
    studentIndexPath: result.studentIndexPath || result.session?.studentIndexPath || "",
    reviewSourcePath: result.session?.reviewSourcePath || "",
    studentsDir: result.session?.studentsDir || "",
    sourceZip: result.session?.sourceZip || null,
    totalStudents: result.totalStudents ?? null,
    completedCount: result.session?.completedStudentKeys?.length || 0,
    skippedCount: result.session?.skippedStudentKeys?.length || 0,
    nextStudentKey: result.nextStudentKey ?? null,
    currentReviewState: result.currentReviewState || null,
  };
}

function resolveFrom(cwd, filePath) {
  if (!filePath) return "";
  return path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--session-path") {
      args.sessionPath = value;
      index += 1;
    }
  }
  return args;
}

function main(argv) {
  const result = resumeTask(parseArgs(argv));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (["invalid_session", "blocked"].includes(result.status)) process.exitCode = 2;
}

if (require.main === module) {
  try {
    main(process.argv);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  resumeTask,
};
