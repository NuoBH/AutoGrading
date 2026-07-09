const fs = require("node:fs");
const path = require("node:path");

const { extractCompletedStudentKeys, extractSkippedStudentKeys } = require("./record-store.cjs");
const { loadStudentIndex } = require("./student-index.cjs");
const { studentKeyFromDirName } = require("./student-identity.cjs");
const { DEFAULT_SESSION_PATH, loadSession } = require("./task-session.cjs");

const DEFAULT_OUT_PATH = path.join("tmp", "session", "assignment-review-text.md");
const DEFAULT_INDEX_OUT_PATH = path.join("tmp", "session", "assignment-review-text-index.json");
const REVIEW_ASSETS_FILENAME = "review-assets.json";
const DEFAULT_MAX_CHARS_PER_STUDENT = 12000;
const DEFAULT_MAX_TOTAL_CHARS = 160000;

function buildAssignmentReviewText(options = {}) {
  const sessionPath = options.sessionPath || DEFAULT_SESSION_PATH;
  const session = options.session || loadSession(sessionPath);
  const studentIndexPath = options.studentIndexPath || session.studentIndexPath;
  if (!studentIndexPath) throw new Error("student index path is required");
  const index = options.studentIndex || loadStudentIndex(studentIndexPath);
  const students = Array.isArray(index.students) ? index.students : [];
  const completed = handledSet(session, "completed", options);
  const skipped = handledSet(session, "skipped", options);
  const maxCharsPerStudent = positiveInt(options.maxCharsPerStudent, DEFAULT_MAX_CHARS_PER_STUDENT);
  const maxTotalChars = positiveInt(options.maxTotalChars, DEFAULT_MAX_TOTAL_CHARS);
  const outPath = options.outPath || options.out || DEFAULT_OUT_PATH;
  const indexOutPath = options.indexOutPath || options.indexOut || DEFAULT_INDEX_OUT_PATH;

  const sections = [];
  const indexStudents = [];
  let totalChars = 0;
  let skippedHandled = 0;

  for (const [studentIndex, student] of students.entries()) {
    const studentKey = student.studentKey;
    const skipReason = handledReason({ studentKey, completed, skipped, options });
    if (skipReason) {
      skippedHandled += 1;
      indexStudents.push(baseStudentRecord({ student, status: skipReason }));
      continue;
    }

    const studentDir = resolveStudentDir({ session, studentKey, studentIndex });
    const evidenceDir = studentDir ? path.join(studentDir, "evidence") : "";
    const assetsPath = evidenceDir ? path.join(evidenceDir, REVIEW_ASSETS_FILENAME) : "";
    const assets = readJsonIfExists(assetsPath);
    const reviewTextRelative = assets?.reviewText || "review-text.md";
    const reviewTextPath = evidenceDir ? path.join(evidenceDir, reviewTextRelative) : "";
    const textRead = readReviewText(reviewTextPath);
    const remaining = maxTotalChars - totalChars;
    const limit = Math.max(0, Math.min(maxCharsPerStudent, remaining));
    const clipped = truncateText(textRead.text, limit);
    totalChars += clipped.text.length;

    const status = textRead.ok ? "included" : "missing_review_text";
    const record = {
      ...baseStudentRecord({ student, status }),
      studentDir,
      evidenceDir,
      reviewTextPath,
      evidenceComplete: assets?.evidenceComplete === true,
      textBundleComplete: assets?.textBundleComplete === true,
      textBundleStrategy: assets?.textBundleStrategy || "",
      chars: clipped.text.length,
      truncated: clipped.truncated || textRead.truncated,
      missingReason: textRead.ok ? "" : textRead.reason,
    };
    indexStudents.push(record);
    sections.push(formatStudentSection({ student, record, text: clipped.text }));

    if (totalChars >= maxTotalChars) break;
  }

  const output = formatAssignmentText({
    session,
    index,
    sections,
    totalChars,
    maxTotalChars,
  });
  const summary = {
    totalStudents: students.length,
    included: sections.length,
    skippedHandled,
    missingReviewText: indexStudents.filter((student) => student.status === "missing_review_text").length,
    totalChars,
    truncatedByTotalLimit: totalChars >= maxTotalChars && sections.length < students.length - skippedHandled,
  };
  const indexRecord = {
    schemaVersion: 1,
    courseName: session.courseName || index.courseName || "",
    assignmentName: session.assignmentName || index.assignmentName || "",
    reviewMode: session.reviewMode || index.reviewMode || "",
    generatedAt: new Date().toISOString(),
    sessionPath,
    studentIndexPath,
    outputPath: outPath,
    summary,
    students: indexStudents,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, output, "utf8");
  fs.mkdirSync(path.dirname(indexOutPath), { recursive: true });
  fs.writeFileSync(indexOutPath, `${JSON.stringify(indexRecord, null, 2)}\n`, "utf8");

  return {
    status: "assignment_review_text_built",
    outPath,
    indexOutPath,
    summary,
  };
}

function handledSet(session, kind, options) {
  const fromSession = kind === "completed"
    ? session.completedStudentKeys || []
    : session.skippedStudentKeys || [];
  const fromResult = kind === "completed"
    ? extractCompletedStudentKeys({ resultPath: session.resultPath, assignmentName: session.assignmentName })
    : extractSkippedStudentKeys({ resultPath: session.resultPath, assignmentName: session.assignmentName });
  if (kind === "completed" && options.includeCompleted) return new Set();
  if (kind === "skipped" && options.includeSkipped) return new Set();
  return new Set([...fromSession, ...fromResult].filter(Boolean));
}

function handledReason({ studentKey, completed, skipped }) {
  if (completed.has(studentKey)) return "skipped_completed";
  if (skipped.has(studentKey)) return "skipped_user_skipped";
  return "";
}

function resolveStudentDir({ session, studentKey, studentIndex }) {
  if (session.studentsDir) {
    const matched = findStudentDirByKey(session.studentsDir, studentKey);
    if (matched) return matched;
  }
  if (session.localWorkIndex && studentIndex >= 0) {
    return path.join("tmp", `work-${session.localWorkIndex}`, `student-${String(studentIndex + 1).padStart(3, "0")}`);
  }
  return "";
}

function findStudentDirByKey(studentsDir, studentKey) {
  if (!studentsDir || !fs.existsSync(studentsDir)) return "";
  const entry = fs.readdirSync(studentsDir, { withFileTypes: true })
    .find((item) => item.isDirectory() && studentKeyFromDirName(item.name) === studentKey);
  return entry ? path.join(studentsDir, entry.name) : "";
}

function readReviewText(reviewTextPath) {
  if (!reviewTextPath || !fs.existsSync(reviewTextPath)) {
    return { ok: false, text: "", reason: "review text file missing", truncated: false };
  }
  const text = fs.readFileSync(reviewTextPath, "utf8").trim();
  if (!text) return { ok: false, text: "", reason: "review text file empty", truncated: false };
  return { ok: true, text, reason: "", truncated: false };
}

function truncateText(text, maxChars) {
  if (!text || maxChars <= 0) return { text: "", truncated: !!text };
  if (text.length <= maxChars) return { text, truncated: false };
  if (maxChars <= 16) {
    return {
      text: `${text.slice(0, maxChars).trim()}\n[truncated]`,
      truncated: true,
    };
  }
  return {
    text: `${text.slice(0, Math.max(0, maxChars - 16)).trim()}\n[truncated]`,
    truncated: true,
  };
}

function formatAssignmentText({ session, index, sections, totalChars, maxTotalChars }) {
  const lines = [
    "# Assignment Review Text Bundle",
    "",
    `Course: ${session.courseName || index.courseName || ""}`,
    `Assignment: ${session.assignmentName || index.assignmentName || ""}`,
    "",
    "This file combines per-student review-text.md files for first-pass text review. Use it only as evidence; final scores still belong in the result record.",
    "",
    `Included sections: ${sections.length}`,
    `Character budget used: ${totalChars}/${maxTotalChars}`,
    "",
    ...sections,
    "",
  ];
  return lines.join("\n");
}

function formatStudentSection({ student, record, text }) {
  const body = text || "[missing review text]";
  return [
    `## ${student.studentKey} ${student.studentName || ""}`.trim(),
    "",
    `Status: ${record.status}`,
    `Evidence complete: ${record.evidenceComplete}`,
    `Review text path: ${record.reviewTextPath || ""}`,
    record.missingReason ? `Missing reason: ${record.missingReason}` : "",
    "",
    body,
    "",
  ].filter((line) => line !== "").join("\n");
}

function baseStudentRecord({ student, status }) {
  return {
    studentName: student.studentName || "",
    studentKey: student.studentKey || "",
    status,
  };
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--session-path") {
      args.sessionPath = value;
      index += 1;
    } else if (key === "--student-index") {
      args.studentIndexPath = value;
      index += 1;
    } else if (key === "--out") {
      args.outPath = value;
      index += 1;
    } else if (key === "--index-out") {
      args.indexOutPath = value;
      index += 1;
    } else if (key === "--include-completed") {
      args.includeCompleted = true;
    } else if (key === "--include-skipped") {
      args.includeSkipped = true;
    } else if (key === "--max-chars-per-student") {
      args.maxCharsPerStudent = value;
      index += 1;
    } else if (key === "--max-total-chars") {
      args.maxTotalChars = value;
      index += 1;
    }
  }
  return args;
}

function main(argv) {
  const result = buildAssignmentReviewText(parseArgs(argv));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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
  buildAssignmentReviewText,
};
