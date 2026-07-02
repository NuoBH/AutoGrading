const { appendSkippedReviews } = require("./result-utils.cjs");
const { loadStudentIndex, studentKeysFromIndex } = require("./student-index.cjs");
const { resolveStudentKeys } = require("./student-matcher.cjs");
const { DEFAULT_SESSION_PATH, markSkipped, markSkippedDecision } = require("./task-session.cjs");

function applySkippedStudents(options) {
  const studentIndexPath = options.studentIndexPath || options.indexPath;
  const resultPath = options.resultPath;
  const assignmentName = options.assignmentName;
  const sessionPath = options.sessionPath || DEFAULT_SESSION_PATH;
  const studentNames = normalizeNameList(options.studentNames || options.names || options.skipStudents || []);

  if (!studentIndexPath) throw new Error("studentIndexPath is required");
  if (!resultPath) throw new Error("resultPath is required");
  if (!assignmentName) throw new Error("assignmentName is required");

  const index = loadStudentIndex(studentIndexPath);
  const students = index.students || [];
  const studentKeys = studentKeysFromIndex(index);
  const matchedKeys = new Set();
  const unmatchedNames = [];
  const ambiguousNames = [];

  for (const name of studentNames) {
    const resolved = resolveStudentKeys(students, { studentNames: [name] });
    if (resolved.matchedKeys.length === 0) {
      unmatchedNames.push(name);
    } else if (resolved.matchedKeys.length > 1) {
      ambiguousNames.push(name);
    } else {
      matchedKeys.add(resolved.matchedKeys[0]);
    }
  }

  const matchedStudents = Array.from(matchedKeys).map((studentKey) => {
    const student = students.find((item) => item.studentKey === studentKey) || {};
    return { studentName: student.studentName || "", studentKey };
  });

  const appendResult = appendSkippedReviews({ resultPath, assignmentName, students: matchedStudents });
  for (const student of matchedStudents) {
    markSkipped({ sessionPath, studentKey: student.studentKey, studentKeys });
  }
  if (unmatchedNames.length === 0 && ambiguousNames.length === 0) {
    markSkippedDecision({ sessionPath, decision: matchedStudents.length > 0 ? "done" : "none" });
  }

  return {
    status: "skipped_applied",
    matchedStudentKeys: matchedStudents.map((student) => student.studentKey),
    appendedStudentKeys: appendResult.appended || [],
    alreadyRecordedStudentKeys: matchedStudents.map((student) => student.studentKey).filter((key) => !(appendResult.appended || []).includes(key)),
    unmatchedNames,
    ambiguousNames,
  };
}

function normalizeNameList(values) {
  if (typeof values === "string") return values.split(",").map((value) => value.trim()).filter(Boolean);
  return (values || []).map((value) => String(value || "").trim()).filter(Boolean);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--")) continue;
    const argName = key.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (argName === "studentIndex") args.studentIndexPath = value;
    else if (argName === "assignment") args.assignmentName = value;
    else args[argName] = value;
    index += 1;
  }
  return args;
}

function main(argv) {
  const result = applySkippedStudents(parseArgs(argv));
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
  applySkippedStudents,
};
