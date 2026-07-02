const path = require("node:path");

const { captureWebRoster, DEFAULT_ROSTER_JSON_PATH, writeRosterJson } = require("./capture-web-roster.cjs");
const { appendAlreadyCompletedReviews, extractCompletedStudentKeys, extractSkippedStudentKeys } = require("./result-utils.cjs");
const { parseRosterRows, saveRosterStudentIndex } = require("./web-roster.cjs");
const { DEFAULT_STUDENT_INDEX_PATH, loadStudentIndex, studentKeysFromIndex } = require("./student-index.cjs");
const { DEFAULT_SESSION_PATH, initSession, loadSession, markCompleted, nextStudentKey } = require("./task-session.cjs");

async function initWebReview(options = {}) {
  const courseName = options.courseName || options.course;
  const assignmentName = options.assignmentName || options.assignment;
  const rubricPath = options.rubricPath || "";
  const resultPath = options.resultPath;
  const sessionPath = options.sessionPath || DEFAULT_SESSION_PATH;
  const studentIndexPath = options.studentIndexPath || DEFAULT_STUDENT_INDEX_PATH;
  const rosterJsonPath = options.rosterJsonPath || DEFAULT_ROSTER_JSON_PATH;

  if (!courseName) throw new Error("courseName is required");
  if (!assignmentName) throw new Error("assignmentName is required");
  if (!resultPath) throw new Error("resultPath is required");

  const captured = await (options.captureRoster
    ? options.captureRoster()
    : captureWebRoster({ browserSession: options.browserSession || options.session, maxPages: options.maxPages }));

  writeRosterJson({
    rosterJsonPath,
    courseName,
    assignmentName,
    rows: captured.rows,
    pageCount: captured.pageCount,
  });

  const students = parseRosterRows(captured.rows);
  saveRosterStudentIndex({
    indexPath: studentIndexPath,
    courseName,
    assignmentName,
    students,
  });
  const index = loadStudentIndex(studentIndexPath);
  const studentKeys = studentKeysFromIndex(index);
  const restoredCompletedKeys = extractCompletedStudentKeys({ resultPath, assignmentName });
  const restoredSkippedKeys = extractSkippedStudentKeys({ resultPath, assignmentName });

  const sessionRecord = initSession({
    sessionPath,
    courseName,
    assignmentName,
    localWorkIndex: options.localWorkIndex || null,
    reviewMode: "web_download",
    status: "reviewing_students",
    rubricPath,
    resultPath,
    reviewSourcePath: options.reviewSourcePath || path.dirname(rosterJsonPath),
    studentIndexPath,
    studentsDir: options.studentsDir || "",
    completedStudentKeys: restoredCompletedKeys,
    skippedStudentKeys: restoredSkippedKeys,
    currentStudentKey: nextStudentKey({
      completedStudentKeys: restoredCompletedKeys,
      skippedStudentKeys: restoredSkippedKeys,
    }, studentKeys),
  });

  let syncCompletedResult = null;
  if (options.syncCompleted) {
    const completedStudents = students.filter((student) => student.status === "completed" && !restoredSkippedKeys.includes(student.studentKey));
    const appendResult = appendAlreadyCompletedReviews({ resultPath, assignmentName, students: completedStudents });
    for (const student of completedStudents) {
      markCompleted({ sessionPath, studentKey: student.studentKey, studentKeys });
    }
    syncCompletedResult = {
      matchedStudentKeys: completedStudents.map((student) => student.studentKey),
      appendedStudentKeys: appendResult.appended || [],
      alreadyRecordedStudentKeys: completedStudents.map((student) => student.studentKey).filter((key) => !(appendResult.appended || []).includes(key)),
    };
  }

  const finalSession = syncCompletedResult ? loadSession(sessionPath) : sessionRecord;
  return {
    status: "initialized",
    reviewMode: "web_download",
    rosterJsonPath,
    studentIndexPath,
    sessionPath,
    totalStudents: studentKeys.length,
    completedCount: finalSession.completedStudentKeys.length,
    skippedCount: finalSession.skippedStudentKeys.length,
    currentStudentKey: finalSession.currentStudentKey,
    syncCompleted: syncCompletedResult,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--sync-completed") {
      args.syncCompleted = true;
      continue;
    }
    if (!key?.startsWith("--")) continue;
    const argName = key.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (argName === "session") args.browserSession = value;
    else if (argName === "studentIndex") args.studentIndexPath = value;
    else if (argName === "rosterJson") args.rosterJsonPath = value;
    else if (argName === "course") args.courseName = value;
    else if (argName === "assignment") args.assignmentName = value;
    else args[argName] = value;
    index += 1;
  }
  return args;
}

async function main(argv) {
  const result = await initWebReview(parseArgs(argv));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main(process.argv).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  initWebReview,
};
