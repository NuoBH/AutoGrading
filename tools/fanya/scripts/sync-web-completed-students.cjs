const fs = require("node:fs");
const path = require("node:path");

const { loadStudentIndex } = require("./student-index.cjs");
const { parseRosterRows } = require("./web-roster.cjs");
const {
  appendAlreadyCompletedReviews,
  extractSkippedStudentKeys,
} = require("./result-utils.cjs");
const { resolveStudentKeys } = require("./student-matcher.cjs");
const { DEFAULT_SESSION_PATH, markCompleted } = require("./task-session.cjs");

function syncWebCompletedStudents(options) {
  const studentIndexPath = options.studentIndexPath || options.indexPath;
  const resultPath = options.resultPath;
  const assignmentName = options.assignmentName;
  const sessionPath = options.sessionPath || DEFAULT_SESSION_PATH;
  const rosterJsonPath = options.rosterJsonPath;

  if (!studentIndexPath) throw new Error("studentIndexPath is required");
  if (!resultPath) throw new Error("resultPath is required");
  if (!assignmentName) throw new Error("assignmentName is required");
  if (!rosterJsonPath) throw new Error("rosterJsonPath is required");

  const index = loadStudentIndex(studentIndexPath);
  if (index.reviewMode !== "bundle_zip") {
    throw new Error(`Expected bundle_zip student index, got ${index.reviewMode || "unknown"}`);
  }

  const bundleStudents = index.students || [];
  const bundleKeys = new Set(bundleStudents.map((student) => student.studentKey).filter(Boolean));
  const skippedKeys = new Set(extractSkippedStudentKeys({ resultPath, assignmentName }));
  const completedRows = readRosterStudents(rosterJsonPath).filter((student) => student.status === "completed");

  const matchedByKey = new Map();
  const unmatchedCompletedStudents = [];
  const skippedStudentKeys = [];

  for (const webStudent of completedRows) {
    const matchedKey = matchBundleStudentKey({ webStudent, bundleStudents, bundleKeys });
    if (!matchedKey) {
      unmatchedCompletedStudents.push(minimalStudent(webStudent));
      continue;
    }
    if (skippedKeys.has(matchedKey)) {
      skippedStudentKeys.push(matchedKey);
      continue;
    }
    if (!matchedByKey.has(matchedKey)) {
      const bundleStudent = bundleStudents.find((student) => student.studentKey === matchedKey) || {};
      matchedByKey.set(matchedKey, {
        studentName: bundleStudent.studentName || webStudent.studentName || "",
        studentKey: matchedKey,
      });
    }
  }

  const matchedStudents = Array.from(matchedByKey.values());
  const appendResult = appendAlreadyCompletedReviews({
    resultPath,
    assignmentName,
    students: matchedStudents,
  });
  const appendedSet = new Set(appendResult.appended || []);
  const studentKeys = bundleStudents.map((student) => student.studentKey).filter(Boolean);

  for (const student of matchedStudents) {
    markCompleted({
      sessionPath,
      studentKey: student.studentKey,
      studentKeys,
    });
  }

  const matchedStudentKeys = matchedStudents.map((student) => student.studentKey);
  return {
    status: "synced",
    matchedStudentKeys,
    appendedStudentKeys: appendResult.appended || [],
    alreadyRecordedStudentKeys: matchedStudentKeys.filter((key) => !appendedSet.has(key)),
    skippedStudentKeys: unique(skippedStudentKeys),
    unmatchedCompletedStudents,
  };
}

function readRosterStudents(rosterJsonPath) {
  const payload = JSON.parse(fs.readFileSync(rosterJsonPath, "utf8"));
  if (Array.isArray(payload)) return parseRosterRows(payload);
  if (Array.isArray(payload.students)) return payload.students;
  return parseRosterRows(payload.rows || []);
}

function matchBundleStudentKey({ webStudent, bundleStudents, bundleKeys }) {
  const webKey = webStudent.studentKey || "";
  if (webKey && !webKey.startsWith("local-") && bundleKeys.has(webKey)) return webKey;

  const resolved = resolveStudentKeys(bundleStudents, {
    studentNames: [webStudent.studentName].filter(Boolean),
  });
  return resolved.matchedKeys.length === 1 ? resolved.matchedKeys[0] : "";
}

function minimalStudent(student) {
  return {
    studentName: student.studentName || "",
    studentKey: student.studentKey || "",
    status: student.status || "",
  };
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--")) continue;
    const argName = key.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (argName === "studentIndex") {
      args.studentIndexPath = value;
    } else if (argName === "assignment") {
      args.assignmentName = value;
    } else if (argName === "rosterJson") {
      args.rosterJsonPath = value;
    } else {
      args[argName] = value;
    }
    index += 1;
  }
  return args;
}

function main(argv) {
  const result = syncWebCompletedStudents(parseArgs(argv));
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
  syncWebCompletedStudents,
};
