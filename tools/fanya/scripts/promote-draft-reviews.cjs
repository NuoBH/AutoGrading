const fs = require("node:fs");

const { loadRecord, saveRecord } = require("./record-store.cjs");
const { commentQualityIssues, validateStudentFacingComment } = require("./review-text-quality.cjs");
const { loadStudentIndex, studentKeysFromIndex } = require("./student-index.cjs");
const { loadSession, nextStudentKey, saveSession } = require("./task-session.cjs");

function promoteDraftReviews({ resultPath, assignmentName, sessionPath, dryRun = false, notesPath = "" }) {
  if (!resultPath) throw new Error("--result-path is required");
  if (!assignmentName) throw new Error("--assignment is required");
  if (!sessionPath) throw new Error("--session-path is required");

  const session = loadSession(sessionPath);
  const index = loadStudentIndex(session.studentIndexPath);
  const validKeys = new Set(studentKeysFromIndex(index));
  const record = loadRecord(resultPath);
  const assignment = (record.assignments || []).find((item) => item.assignmentName === assignmentName);
  if (!assignment) throw new Error(`assignment not found: ${assignmentName}`);
  const drafts = assignment.draftReviews || [];
  const missingKeys = drafts
    .map((draft) => draft.studentKey)
    .filter((studentKey) => studentKey && !validKeys.has(studentKey));
  if (missingKeys.length) {
    throw new Error(`draft studentKey is not in current student index: ${missingKeys.join(", ")}`);
  }

  const promoted = [];
  const skippedBecauseFinalExists = [];
  const blockingIssues = draftBlockingIssues(drafts);
  const notes = loadNotes(notesPath);
  assignment.reviews ||= [];
  for (const draft of drafts) {
    const finalExists = assignment.reviews.some((review) => review.studentKey === draft.studentKey);
    if (finalExists) {
      skippedBecauseFinalExists.push(draft.studentKey);
      continue;
    }
    if (!dryRun) validateStudentFacingComment(draft.comment || "");
    if (dryRun) {
      promoted.push(draft.studentKey);
      continue;
    }
    assignment.reviews.push({
      studentName: draft.studentName || "",
      studentKey: draft.studentKey,
      submissionSummary: draft.submissionSummary || "",
      suggestedScore: draft.suggestedScore ?? null,
      comment: draft.comment || "",
      status: "reviewed",
      statusReason: "",
    });
    draft.promoted = true;
    draft.promotedAt = new Date().toISOString();
    promoted.push(draft.studentKey);
  }

  if (dryRun) {
    return {
      dryRun: true,
      draftCount: drafts.length,
      existingFinalCount: skippedBecauseFinalExists.length,
      wouldPromoteCount: promoted.length,
      promoted,
      skippedBecauseFinalExists,
      scoreDistribution: scoreDistribution(drafts.filter((draft) => promoted.includes(draft.studentKey))),
      unresolvedNotesCount: notes.length,
      blockingIssues,
    };
  }

  if (promoted.length) {
    saveRecord(resultPath, record);
    const completed = new Set(session.completedStudentKeys || []);
    for (const studentKey of promoted) completed.add(studentKey);
    const updatedSession = {
      ...session,
      completedStudentKeys: Array.from(completed),
      currentStudentKey: nextStudentKey({
        ...session,
        completedStudentKeys: Array.from(completed),
      }, studentKeysFromIndex(index)),
      updatedAt: new Date().toISOString(),
    };
    saveSession(updatedSession, sessionPath);
  }

  return {
    promoted,
    skippedBecauseFinalExists,
    draftCount: drafts.length,
  };
}

function main(argv) {
  const result = promoteDraftReviews({
    resultPath: argValue(argv, "--result-path"),
    assignmentName: argValue(argv, "--assignment"),
    sessionPath: argValue(argv, "--session-path"),
    dryRun: hasFlag(argv, "--dry-run"),
    notesPath: argValue(argv, "--notes-path"),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function argValue(argv, key) {
  const index = argv.indexOf(key);
  return index === -1 ? "" : argv[index + 1];
}

function hasFlag(argv, key) {
  return argv.includes(key);
}

function draftBlockingIssues(drafts) {
  return drafts.flatMap((draft) => (
    commentQualityIssues(draft.comment || "").map((issue) => ({
      ...issue,
      studentKey: draft.studentKey,
    }))
  ));
}

function scoreDistribution(drafts) {
  return drafts.reduce((counts, draft) => {
    const score = Number(draft.suggestedScore);
    if (Number.isFinite(score) && score >= 90 && score <= 100) counts["90-100"] += 1;
    else if (Number.isFinite(score) && score >= 80 && score <= 89) counts["80-89"] += 1;
    else if (Number.isFinite(score) && score >= 70 && score <= 79) counts["70-79"] += 1;
    else counts.other += 1;
    return counts;
  }, { "70-79": 0, "80-89": 0, "90-100": 0, other: 0 });
}

function loadNotes(notesPath) {
  if (!notesPath || !fs.existsSync(notesPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(notesPath, "utf8"));
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.notes)) return parsed.notes;
    if (Array.isArray(parsed.issues)) return parsed.issues;
    return [];
  } catch {
    return [{ issueCode: "invalid_notes_file" }];
  }
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
  promoteDraftReviews,
};
