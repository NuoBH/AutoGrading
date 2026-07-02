const fs = require("node:fs");
const path = require("node:path");

const { importBundle } = require("./import-bundle.cjs");
const { initWebReview } = require("./init-web-review.cjs");
const { resumeTask } = require("./resume-task.cjs");
const {
  RUBRIC_KIND,
  assignmentDraftReviews,
  createRubricRecordFile,
  extractCompletedStudentKeys,
  extractHandledStudentKeys,
  extractSkippedStudentKeys,
  loadRecord,
  saveRecord,
} = require("./record-store.cjs");
const { normalizeContextName } = require("./review-context.cjs");
const { loadStudentIndex, saveStudentIndex, studentKeysFromIndex } = require("./student-index.cjs");
const { standardStudentDirName, studentKeyFromDirName } = require("./student-identity.cjs");
const { DEFAULT_SESSION_PATH, loadSession, nextStudentKey, saveSession } = require("./task-session.cjs");

const LOCAL_KEY_RE = /^local-\d{3}$/;

async function repairTask(options = {}) {
  if (!options.confirm) throw new Error("--confirm is required for repair");

  const sessionPath = options.sessionPath || DEFAULT_SESSION_PATH;
  const diagnosis = resumeTask({ sessionPath });
  if (diagnosis.status === "invalid_session") return diagnosis;

  const session = loadSession(sessionPath);
  if (hasIssue(diagnosis.issues, "missing_result")) return diagnosis;

  if (hasIssue(diagnosis.issues, "missing_rubric")) {
    return repairRubric({ session, sessionPath, diagnosis, options });
  }

  if (diagnosis.status === "can_rebuild_bundle") {
    return repairBundle({ session, sessionPath, diagnosis, options });
  }

  if (diagnosis.status === "can_rebuild_web_index") {
    return repairWebIndex({ session, sessionPath, diagnosis, options });
  }

  if (diagnosis.status === "needs_user_action" && (
    hasIssue(diagnosis.issues, "missing_bundle_zip")
    || hasIssue(diagnosis.issues, "multiple_bundle_candidates")
  )) {
    return diagnosis;
  }

  return {
    status: "no_repair_needed",
    reviewMode: session.reviewMode,
    sessionPath,
    issues: diagnosis.issues || [],
    nextActions: ["Run resume-task.cjs and continue with the reported normal workflow."],
  };
}

function repairRubric({ session, sessionPath, diagnosis, options }) {
  if (options.regenerateRubric) {
    return regenerateRubric({ session, sessionPath, options });
  }
  if (!options.rubricPath) return diagnosis;

  const rubric = loadRecord(options.rubricPath);
  if (rubric.kind !== RUBRIC_KIND) {
    return needsUserAction({
      session,
      sessionPath,
      issues: [issue("invalid_rubric", "Provided record is not a Fanya rubric.", { rubricPath: options.rubricPath })],
    });
  }

  const mismatch = rubricContextMismatch({ session, rubric });
  if (mismatch) {
    return needsUserAction({
      session,
      sessionPath,
      issues: [mismatch],
    });
  }

  if (rubric.status !== "confirmed") {
    return needsUserAction({
      session,
      sessionPath,
      issues: [issue("rubric_not_confirmed", "Rubric exists but is not confirmed yet.", { rubricPath: options.rubricPath })],
      nextActions: ["Show the rubric to the user and confirm it before resuming grading."],
    });
  }

  const updatedSession = { ...session, rubricPath: options.rubricPath, updatedAt: new Date().toISOString() };
  saveSession(updatedSession, sessionPath);
  updateResultRubricPath(session.resultPath, session.assignmentName, options.rubricPath);
  return {
    status: "repaired_rubric",
    reviewMode: session.reviewMode,
    sessionPath,
    rubricPath: options.rubricPath,
    resultPath: session.resultPath,
    issues: [],
    nextActions: ["Rerun resume-task.cjs before continuing review."],
  };
}

function regenerateRubric({ session, sessionPath, options }) {
  if (!options.rubricPath) {
    return needsUserAction({
      session,
      sessionPath,
      issues: [issue("missing_rubric_output_path", "rubricPath is required to regenerate a rubric.")],
    });
  }
  const rubricInput = options.rubric || {};
  const missing = ["assignmentSummary", "dimensions", "scoreBands"].filter((field) => rubricInput[field] == null);
  if (missing.length > 0) {
    return needsUserAction({
      session,
      sessionPath,
      issues: [issue("missing_rubric_content", "Regenerating a rubric requires assignmentSummary, dimensions, and scoreBands.", { fields: missing })],
    });
  }

  const status = options.confirmRubric ? "confirmed" : "draft";
  createRubricRecordFile({
    rubricPath: options.rubricPath,
    courseName: session.courseName,
    assignmentName: session.assignmentName,
    assignmentSummary: rubricInput.assignmentSummary,
    dimensions: rubricInput.dimensions,
    scoreBands: rubricInput.scoreBands,
    status,
  });

  if (status !== "confirmed") {
    return needsUserAction({
      session,
      sessionPath,
      issues: [issue("rubric_not_confirmed", "Regenerated rubric is a draft and must be confirmed before grading.")],
      nextActions: ["Show the regenerated rubric to the user, then rerun repair with --confirm-rubric after confirmation."],
    });
  }

  const updatedSession = { ...session, rubricPath: options.rubricPath, updatedAt: new Date().toISOString() };
  saveSession(updatedSession, sessionPath);
  updateResultRubricPath(session.resultPath, session.assignmentName, options.rubricPath);
  return {
    status: "repaired_rubric",
    reviewMode: session.reviewMode,
    sessionPath,
    rubricPath: options.rubricPath,
    resultPath: session.resultPath,
    issues: [],
    nextActions: ["Rerun resume-task.cjs before continuing review."],
  };
}

async function repairBundle({ session, sessionPath, diagnosis, options }) {
  const oldIndex = readStudentIndexIfExists(session.studentIndexPath);
  const stagingRoot = makeStagingRoot(sessionPath);
  const stagedWorkDir = path.join(stagingRoot, "work");
  const stagedSessionPath = path.join(stagingRoot, "fanya-current-task.json");
  const stagedIndexPath = path.join(stagingRoot, "fanya-current-student-index.json");

  try {
    const sourceZip = diagnosis.repairSuggestion?.sourceZip || session.sourceZip;
    const importResult = importBundle({
      courseName: session.courseName,
      assignmentName: session.assignmentName,
      localWorkIndex: session.localWorkIndex,
      bundleDir: sourceZip ? path.dirname(sourceZip) : undefined,
      outputRoot: stagedWorkDir,
      sessionPath: stagedSessionPath,
      studentIndexPath: stagedIndexPath,
      rubricPath: session.rubricPath,
      resultPath: session.resultPath,
    });
    if (importResult.status !== "imported") {
      return needsUserAction({
        session,
        sessionPath,
        issues: [issue("bundle_import_failed", "Bundle archive could not be imported.", { importStatus: importResult.status })],
      });
    }

    if (options.localKeyMapPath) {
      try {
        applyLocalKeyMap({
          mapPath: options.localKeyMapPath,
          oldIndex,
          stagedIndexPath,
          stagedStudentsDir: importResult.studentsDir,
        });
      } catch (error) {
        return blocked({
          session,
          sessionPath,
          issues: [issue("invalid_local_key_map", error.message, { mapPath: options.localKeyMapPath })],
        });
      }
    }

    const stagedIndex = loadStudentIndex(stagedIndexPath);
    const comparison = compareRepairedKeys({ session, oldIndex, newIndex: stagedIndex });
    if (comparison.localMappingRequired && !options.localKeyMapPath) {
      return needsUserAction({
        session,
        sessionPath,
        issues: [issue("local_key_mapping_required", "Bundle repair detected changed or missing local-* student keys. Provide a user-confirmed --local-key-map file.", { missingKeys: comparison.missingKeys })],
        comparison,
      });
    }
    if (comparison.missingKeys.length > 0) {
      return blocked({
        session,
        sessionPath,
        issues: [issue("missing_repaired_keys", "Repaired bundle index is missing handled or current student keys.", { missingKeys: comparison.missingKeys })],
        comparison,
      });
    }

    const targetWorkDir = session.reviewSourcePath || importResult.workDir;
    replaceDirectory(stagedWorkDir, targetWorkDir);
    const finalStudentsDir = path.join(targetWorkDir, "students");
    saveStudentIndex({
      indexPath: session.studentIndexPath,
      courseName: session.courseName,
      assignmentName: session.assignmentName,
      reviewMode: "bundle_zip",
      source: "bundle_students_dir",
      students: stagedIndex.students,
    });

    const finalIndex = loadStudentIndex(session.studentIndexPath);
    const studentKeys = studentKeysFromIndex(finalIndex);
    const completedStudentKeys = extractCompletedStudentKeys({ resultPath: session.resultPath, assignmentName: session.assignmentName });
    const skippedStudentKeys = extractSkippedStudentKeys({ resultPath: session.resultPath, assignmentName: session.assignmentName });
    const handledKeys = new Set([...completedStudentKeys, ...skippedStudentKeys]);
    const pendingEvidenceStudentKeys = studentKeys.filter((studentKey) => !handledKeys.has(studentKey));
    const warnings = warningsForComparison(comparison);
    const finalSession = {
      ...session,
      reviewMode: "bundle_zip",
      reviewSourcePath: targetWorkDir,
      sourceZip: importResult.sourceZip,
      studentsDir: finalStudentsDir,
      completedStudentKeys,
      skippedStudentKeys,
      currentStudentKey: nextStudentKey({ completedStudentKeys, skippedStudentKeys }, studentKeys),
      updatedAt: new Date().toISOString(),
    };
    saveSession(finalSession, sessionPath);

    return {
      status: "repaired_bundle",
      reviewMode: "bundle_zip",
      sessionPath,
      studentIndexPath: session.studentIndexPath,
      reviewSourcePath: targetWorkDir,
      studentsDir: finalStudentsDir,
      totalStudents: studentKeys.length,
      completedCount: completedStudentKeys.length,
      skippedCount: skippedStudentKeys.length,
      nextStudentKey: finalSession.currentStudentKey,
      pendingEvidenceStudentKeys,
      staleArtifacts: ["contact_sheet", "contact_sheet_mapping"],
      comparison,
      warnings,
      issues: [],
      nextActions: ["Rerun resume-task.cjs before continuing review."],
    };
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}

async function repairWebIndex({ session, sessionPath, diagnosis, options }) {
  if (!options.captureRoster && !options.browserSession) {
    return needsUserAction({
      session,
      sessionPath,
      issues: [issue("missing_browser_session", "Web index repair needs an active browser session on the assignment review list.")],
      nextActions: ["Open the correct assignment review list, then rerun repair with --browser-session."],
    });
  }

  const oldIndex = readStudentIndexIfExists(session.studentIndexPath);
  const stagingRoot = makeStagingRoot(sessionPath);
  const stagedSessionPath = path.join(stagingRoot, "fanya-current-task.json");
  const stagedIndexPath = path.join(stagingRoot, "fanya-current-student-index.json");
  const stagedRosterJsonPath = path.join(stagingRoot, "web-roster.json");
  try {
    await initWebReview({
      courseName: session.courseName,
      assignmentName: session.assignmentName,
      localWorkIndex: session.localWorkIndex,
      rubricPath: session.rubricPath,
      resultPath: session.resultPath,
      sessionPath: stagedSessionPath,
      studentIndexPath: stagedIndexPath,
      rosterJsonPath: stagedRosterJsonPath,
      reviewSourcePath: path.dirname(options.rosterJsonPath || path.join(path.dirname(sessionPath), "web-roster.json")),
      browserSession: options.browserSession,
      captureRoster: options.captureRoster,
    });

    const stagedIndex = loadStudentIndex(stagedIndexPath);
    const comparison = compareRepairedKeys({ session, oldIndex, newIndex: stagedIndex });
    if (comparison.missingKeys.length > 0) {
      return blocked({
        session,
        sessionPath,
        issues: [issue("missing_repaired_keys", "Repaired web roster is missing handled or current student keys. Confirm the browser is on the correct assignment page.", { missingKeys: comparison.missingKeys })],
        comparison,
      });
    }

    const rosterJsonPath = options.rosterJsonPath || path.join(path.dirname(sessionPath), "web-roster.json");
    fs.mkdirSync(path.dirname(rosterJsonPath), { recursive: true });
    fs.copyFileSync(stagedRosterJsonPath, rosterJsonPath);
    saveStudentIndex({
      indexPath: session.studentIndexPath,
      courseName: session.courseName,
      assignmentName: session.assignmentName,
      reviewMode: "web_download",
      source: "web_roster",
      students: stagedIndex.students,
    });

    const finalIndex = loadStudentIndex(session.studentIndexPath);
    const studentKeys = studentKeysFromIndex(finalIndex);
    const completedStudentKeys = extractCompletedStudentKeys({ resultPath: session.resultPath, assignmentName: session.assignmentName });
    const skippedStudentKeys = extractSkippedStudentKeys({ resultPath: session.resultPath, assignmentName: session.assignmentName });
    const warnings = warningsForComparison(comparison);
    const finalSession = {
      ...session,
      reviewMode: "web_download",
      reviewSourcePath: path.dirname(rosterJsonPath),
      studentsDir: "",
      completedStudentKeys,
      skippedStudentKeys,
      currentStudentKey: nextStudentKey({ completedStudentKeys, skippedStudentKeys }, studentKeys),
      updatedAt: new Date().toISOString(),
    };
    saveSession(finalSession, sessionPath);

    return {
      status: "repaired_web_index",
      reviewMode: "web_download",
      sessionPath,
      studentIndexPath: session.studentIndexPath,
      rosterJsonPath,
      totalStudents: studentKeys.length,
      completedCount: completedStudentKeys.length,
      skippedCount: skippedStudentKeys.length,
      nextStudentKey: finalSession.currentStudentKey,
      comparison,
      warnings,
      issues: [],
      nextActions: ["Rerun resume-task.cjs before continuing review."],
    };
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}

function compareRepairedKeys({ session, oldIndex, newIndex }) {
  const oldKeys = oldIndex ? studentKeysFromIndex(oldIndex) : [];
  const newKeys = studentKeysFromIndex(newIndex);
  const requiredKeys = unique([
    ...extractHandledStudentKeys({ resultPath: session.resultPath, assignmentName: session.assignmentName }),
    ...(session.completedStudentKeys || []),
    ...(session.skippedStudentKeys || []),
    session.currentStudentKey,
  ]);
  const draftKeys = unique(assignmentDraftReviews(session.resultPath, session.assignmentName).map((draft) => draft.studentKey));
  const missingKeys = requiredKeys.filter((key) => !newKeys.includes(key));
  const missingDraftKeys = draftKeys.filter((key) => !newKeys.includes(key));
  const baselineKeys = oldKeys.length > 0 ? oldKeys : requiredKeys;
  const addedKeys = newKeys.filter((key) => !baselineKeys.includes(key));
  const removedKeys = oldKeys.filter((key) => !newKeys.includes(key));
  const removedLocalKeys = removedKeys.filter(isLocalKey);
  const missingLocalKeys = missingKeys.filter(isLocalKey);
  const localIdentityMismatches = localStudentIdentityMismatches({ oldIndex, newIndex });

  return {
    confidence: oldKeys.length > 0 ? "high" : "low",
    requiredKeys,
    draftKeys,
    missingKeys,
    missingDraftKeys,
    addedKeys,
    removedKeys,
    localIdentityMismatches,
    localMappingRequired: removedLocalKeys.length > 0 || missingLocalKeys.length > 0 || localIdentityMismatches.length > 0,
  };
}

function warningsForComparison(comparison) {
  const warnings = [];
  if (comparison.missingDraftKeys?.length) {
    warnings.push(issue("missing_draft_keys", "Some draftReviews do not match the repaired student index. Ordinary repair can continue, but draft promotion must not proceed for these keys.", {
      missingDraftKeys: comparison.missingDraftKeys,
    }));
  }
  return warnings;
}

function applyLocalKeyMap({ mapPath, oldIndex, stagedIndexPath, stagedStudentsDir }) {
  if (!oldIndex) throw new Error("Cannot apply local-key mapping without an old student index.");
  const mappingRecord = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  const mappings = mappingRecord.mappings || [];
  validateLocalKeyMap(mappings);

  const stagedIndex = loadStudentIndex(stagedIndexPath);
  const newToOld = new Map(mappings.map((entry) => [entry.newStudentKey, entry.oldStudentKey]));
  const reservedOldKeys = new Set(mappings.map((entry) => entry.oldStudentKey));
  const usedKeys = new Set();
  const remappedStudents = stagedIndex.students.map((student) => {
    let studentKey = newToOld.get(student.studentKey) || student.studentKey;
    if (!newToOld.has(student.studentKey) && reservedOldKeys.has(studentKey)) {
      studentKey = nextUnusedLocalKey(new Set([...usedKeys, ...reservedOldKeys]));
    }
    if (usedKeys.has(studentKey)) studentKey = nextUnusedLocalKey(new Set([...usedKeys, ...reservedOldKeys]));
    usedKeys.add(studentKey);
    return { ...student, studentKey };
  });

  const newKeys = new Set(stagedIndex.students.map((student) => student.studentKey));
  const oldKeys = new Set(studentKeysFromIndex(oldIndex));
  for (const entry of mappings) {
    if (!oldKeys.has(entry.oldStudentKey)) throw new Error(`Mapped oldStudentKey not found in old index: ${entry.oldStudentKey}`);
    if (!newKeys.has(entry.newStudentKey)) throw new Error(`Mapped newStudentKey not found in rebuilt index: ${entry.newStudentKey}`);
  }

  remapStudentFolders({ stagedStudentsDir, originalStudents: stagedIndex.students, remappedStudents });
  saveStudentIndex({
    indexPath: stagedIndexPath,
    courseName: stagedIndex.courseName,
    assignmentName: stagedIndex.assignmentName,
    reviewMode: stagedIndex.reviewMode,
    source: stagedIndex.source,
    students: remappedStudents,
  });
}

function validateLocalKeyMap(mappings) {
  const oldKeys = new Set();
  const newKeys = new Set();
  for (const entry of mappings) {
    if (!isLocalKey(entry.oldStudentKey) || !isLocalKey(entry.newStudentKey)) {
      throw new Error("local-key mappings must use local-### oldStudentKey and newStudentKey values.");
    }
    if (oldKeys.has(entry.oldStudentKey)) throw new Error(`Duplicate oldStudentKey in mapping: ${entry.oldStudentKey}`);
    if (newKeys.has(entry.newStudentKey)) throw new Error(`Duplicate newStudentKey in mapping: ${entry.newStudentKey}`);
    oldKeys.add(entry.oldStudentKey);
    newKeys.add(entry.newStudentKey);
  }
}

function remapStudentFolders({ stagedStudentsDir, originalStudents, remappedStudents }) {
  const remappedDir = path.join(path.dirname(stagedStudentsDir), "students-remapped");
  fs.rmSync(remappedDir, { recursive: true, force: true });
  fs.mkdirSync(remappedDir, { recursive: true });
  const entries = fs.readdirSync(stagedStudentsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const [index, original] of originalStudents.entries()) {
    const entry = entries.find((item) => studentKeyFromDirName(item.name) === original.studentKey);
    if (!entry) continue;
    const remapped = remappedStudents[index];
    const targetName = standardStudentDirName({ studentId: remapped.studentKey, studentName: remapped.studentName });
    fs.cpSync(path.join(stagedStudentsDir, entry.name), path.join(remappedDir, targetName), { recursive: true });
  }
  fs.rmSync(stagedStudentsDir, { recursive: true, force: true });
  fs.renameSync(remappedDir, stagedStudentsDir);
}

function updateResultRubricPath(resultPath, assignmentName, rubricPath) {
  if (!resultPath || !fs.existsSync(resultPath)) return;
  const result = loadRecord(resultPath);
  if (result.kind !== "fanya_result") return;
  const assignment = (result.assignments || []).find((item) => normalizeContextName(item.assignmentName) === normalizeContextName(assignmentName));
  if (!assignment) return;
  assignment.rubricPath = rubricPath;
  saveRecord(resultPath, result);
}

function rubricContextMismatch({ session, rubric }) {
  const courseMatches = normalizeContextName(session.courseName) === normalizeContextName(rubric.courseName);
  const assignmentMatches = normalizeContextName(session.assignmentName) === normalizeContextName(rubric.assignmentName);
  if (courseMatches && assignmentMatches) return null;
  return issue("rubric_context_mismatch", "Rubric course or assignment does not match the current task.", {
    expected: { courseName: session.courseName, assignmentName: session.assignmentName },
    actual: { courseName: rubric.courseName, assignmentName: rubric.assignmentName },
  });
}

function localStudentIdentityMismatches({ oldIndex, newIndex }) {
  if (!oldIndex) return [];
  const newByKey = new Map((newIndex.students || []).map((student) => [student.studentKey, student]));
  return (oldIndex.students || [])
    .filter((student) => isLocalKey(student.studentKey))
    .flatMap((oldStudent) => {
      const newStudent = newByKey.get(oldStudent.studentKey);
      if (!newStudent) return [];
      if (normalizeIdentityName(oldStudent.studentName) === normalizeIdentityName(newStudent.studentName)) return [];
      return [{
        studentKey: oldStudent.studentKey,
        oldStudentName: oldStudent.studentName,
        newStudentName: newStudent.studentName,
      }];
    });
}

function normalizeIdentityName(value) {
  return String(value || "").trim().replace(/\s+/g, "").toLowerCase();
}

function readStudentIndexIfExists(indexPath) {
  if (!indexPath || !fs.existsSync(indexPath)) return null;
  return loadStudentIndex(indexPath);
}

function makeStagingRoot(sessionPath) {
  const root = path.join(path.dirname(sessionPath), "repair-staging", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function replaceDirectory(fromDir, toDir) {
  fs.mkdirSync(path.dirname(toDir), { recursive: true });
  fs.rmSync(toDir, { recursive: true, force: true });
  fs.renameSync(fromDir, toDir);
}

function needsUserAction({ session, sessionPath, issues, nextActions, comparison }) {
  return {
    status: "needs_user_action",
    reviewMode: session.reviewMode,
    sessionPath,
    issues,
    nextActions: nextActions || ["Resolve the reported issue, then rerun repair-task.cjs."],
    comparison,
  };
}

function blocked({ session, sessionPath, issues, comparison }) {
  return {
    status: "blocked",
    reviewMode: session.reviewMode,
    sessionPath,
    issues,
    nextActions: ["Do not continue grading from this repaired state. Confirm the task source or start a new session."],
    comparison,
  };
}

function issue(code, message, details = {}) {
  return { code, message, ...details };
}

function hasIssue(issues = [], code) {
  return issues.some((item) => item.code === code);
}

function isLocalKey(value) {
  return LOCAL_KEY_RE.test(String(value || ""));
}

function nextUnusedLocalKey(usedKeys) {
  for (let index = 1; index < 1000; index += 1) {
    const key = `local-${String(index).padStart(3, "0")}`;
    if (!usedKeys.has(key)) return key;
  }
  throw new Error("No unused local key is available.");
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--confirm") {
      args.confirm = true;
    } else if (key === "--confirm-rubric") {
      args.confirmRubric = true;
    } else if (key === "--regenerate-rubric") {
      args.regenerateRubric = true;
    } else if (key === "--session-path") {
      args.sessionPath = value;
      index += 1;
    } else if (key === "--browser-session" || key === "--session") {
      args.browserSession = value;
      index += 1;
    } else if (key === "--roster-json") {
      args.rosterJsonPath = value;
      index += 1;
    } else if (key === "--rubric-path") {
      args.rubricPath = value;
      index += 1;
    } else if (key === "--rubric-json") {
      args.rubric = JSON.parse(fs.readFileSync(value, "utf8"));
      index += 1;
    } else if (key === "--local-key-map") {
      args.localKeyMapPath = value;
      index += 1;
    }
  }
  return args;
}

async function main(argv) {
  const result = await repairTask(parseArgs(argv));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (["blocked", "needs_user_action", "invalid_session"].includes(result.status)) process.exitCode = 2;
}

if (require.main === module) {
  main(process.argv).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  repairTask,
};
