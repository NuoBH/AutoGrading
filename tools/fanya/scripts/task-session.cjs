const fs = require("node:fs");
const path = require("node:path");

const { studentKeyFromDirName } = require("./student-identity.cjs");
const {
  clearStudentIndex,
  DEFAULT_STUDENT_INDEX_PATH,
  loadStudentIndex,
  studentKeysFromIndex,
} = require("./student-index.cjs");

const DEFAULT_SESSION_PATH = path.join("tmp", "session", "fanya-current-task.json");

function nowIso() {
  return new Date().toISOString();
}

function initSession(input) {
  const sessionPath = input.sessionPath || DEFAULT_SESSION_PATH;
  const timestamp = nowIso();
  const skippedStudentKeys = unique(input.skippedStudentKeys || []);
  const completedStudentKeys = unique(input.completedStudentKeys || []);
  const session = {
    schemaVersion: 1,
    courseName: input.courseName,
    assignmentName: input.assignmentName,
    localWorkIndex: input.localWorkIndex,
    reviewMode: input.reviewMode,
    status: input.status || "reviewing_students",
    rubricPath: input.rubricPath,
    resultPath: input.resultPath,
    reviewSourcePath: input.reviewSourcePath,
    studentIndexPath: input.studentIndexPath || null,
    sourceZip: input.sourceZip ?? null,
    studentsDir: input.studentsDir,
    currentStudentKey: input.currentStudentKey || null,
    completedStudentKeys,
    skippedStudentKeys,
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp,
  };
  saveSession(session, sessionPath);
  return session;
}

function loadSession(sessionPath = DEFAULT_SESSION_PATH) {
  return JSON.parse(fs.readFileSync(sessionPath, "utf8"));
}

function saveSession(session, sessionPath = DEFAULT_SESSION_PATH) {
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

function updateSession(patch, sessionPath = DEFAULT_SESSION_PATH) {
  const session = { ...loadSession(sessionPath), ...patch, updatedAt: nowIso() };
  saveSession(session, sessionPath);
  return session;
}

function nextStudentKey(session, studentKeys = []) {
  const completed = new Set([
    ...(session.completedStudentKeys || []),
    ...(session.skippedStudentKeys || []),
  ]);
  return studentKeys.find((key) => !completed.has(key)) || null;
}

function listStudentKeys(studentsDir) {
  if (!studentsDir || !fs.existsSync(studentsDir)) return [];
  return fs.readdirSync(studentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => studentKeyFromDirName(entry.name))
    .filter(Boolean);
}

function listStudentKeysForSession(session) {
  if (session?.studentIndexPath && fs.existsSync(session.studentIndexPath)) {
    return studentKeysFromIndex(loadStudentIndex(session.studentIndexPath));
  }
  return listStudentKeys(session?.studentsDir);
}

function nextStudentFromSession(session) {
  return nextStudentKey(session, listStudentKeysForSession(session));
}

function isComplete(session) {
  const studentKeys = listStudentKeysForSession(session);
  return studentKeys.length > 0 && nextStudentKey(session, studentKeys) === null;
}

function markCompleted({ sessionPath = DEFAULT_SESSION_PATH, studentKey, studentKeys = [] }) {
  const session = loadSession(sessionPath);
  const completed = new Set(session.completedStudentKeys || []);
  completed.add(studentKey);
  const updated = {
    ...session,
    completedStudentKeys: Array.from(completed),
    updatedAt: nowIso(),
  };
  updated.currentStudentKey = nextStudentKey(updated, studentKeys.length ? studentKeys : listStudentKeysForSession(updated));
  saveSession(updated, sessionPath);
  return updated;
}

function markSkipped({ sessionPath = DEFAULT_SESSION_PATH, studentKey, studentKeys = [] }) {
  const session = loadSession(sessionPath);
  const skipped = new Set(session.skippedStudentKeys || []);
  skipped.add(studentKey);
  const updated = {
    ...session,
    skippedStudentKeys: Array.from(skipped),
    updatedAt: nowIso(),
  };
  updated.currentStudentKey = nextStudentKey(updated, studentKeys.length ? studentKeys : listStudentKeysForSession(updated));
  saveSession(updated, sessionPath);
  return updated;
}

function markCompletedSyncDecision({ sessionPath = DEFAULT_SESSION_PATH, decision }) {
  if (!["yes", "no"].includes(decision)) throw new Error("decision must be yes or no");
  const session = loadSession(sessionPath);
  const updated = {
    ...session,
    completedSyncDecision: decision,
    status: "needs_skipped_decision",
    updatedAt: nowIso(),
  };
  saveSession(updated, sessionPath);
  return updated;
}

function markSkippedDecision({ sessionPath = DEFAULT_SESSION_PATH, decision }) {
  if (!["done", "none"].includes(decision)) throw new Error("decision must be done or none");
  const session = loadSession(sessionPath);
  const updated = {
    ...session,
    skippedDecision: decision,
    status: "reviewing_students",
    updatedAt: nowIso(),
  };
  saveSession(updated, sessionPath);
  return updated;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clearSession(sessionPath = DEFAULT_SESSION_PATH) {
  const indexPaths = new Set([defaultStudentIndexPathForSession(sessionPath)]);
  if (fs.existsSync(sessionPath)) {
    const session = readJsonIfPossible(sessionPath);
    if (session?.studentIndexPath) indexPaths.add(session.studentIndexPath);
    fs.rmSync(sessionPath, { force: true });
  }
  for (const indexPath of indexPaths) clearStudentIndex(indexPath);
}

function defaultStudentIndexPathForSession(sessionPath) {
  if (sessionPath === DEFAULT_SESSION_PATH) return DEFAULT_STUDENT_INDEX_PATH;
  return path.join(path.dirname(sessionPath), path.basename(DEFAULT_STUDENT_INDEX_PATH));
}

function readJsonIfPossible(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function parseArgs(argv) {
  const [command] = argv.slice(2);
  const args = { command };
  for (let index = 3; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key?.startsWith("--")) {
      args[key.slice(2)] = value;
      index += 1;
    }
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  if (args.command === "get") {
    process.stdout.write(`${JSON.stringify(loadSession(args.sessionPath), null, 2)}\n`);
    return;
  }
  if (args.command === "clear") {
    clearSession(args.sessionPath);
    process.stdout.write("cleared\n");
    return;
  }
  if (args.command === "mark-completed") {
    const session = markCompleted({
      sessionPath: args.sessionPath,
      studentKey: args["student-key"],
      studentKeys: args["student-keys"] ? args["student-keys"].split(",") : listStudentKeysForSession(loadSession(args.sessionPath)),
    });
    process.stdout.write(`${JSON.stringify(session, null, 2)}\n`);
    return;
  }
  if (args.command === "mark-skipped") {
    const session = markSkipped({
      sessionPath: args.sessionPath,
      studentKey: args["student-key"],
      studentKeys: args["student-keys"] ? args["student-keys"].split(",") : listStudentKeysForSession(loadSession(args.sessionPath)),
    });
    process.stdout.write(`${JSON.stringify(session, null, 2)}\n`);
    return;
  }
  if (args.command === "mark-completed-sync-decision") {
    const session = markCompletedSyncDecision({
      sessionPath: args.sessionPath,
      decision: args.decision,
    });
    process.stdout.write(`${JSON.stringify(session, null, 2)}\n`);
    return;
  }
  if (args.command === "mark-skipped-decision") {
    const session = markSkippedDecision({
      sessionPath: args.sessionPath,
      decision: args.decision,
    });
    process.stdout.write(`${JSON.stringify(session, null, 2)}\n`);
    return;
  }
  if (args.command === "next-student") {
    process.stdout.write(`${nextStudentFromSession(loadSession(args.sessionPath)) || ""}\n`);
    return;
  }
  if (args.command === "is-complete") {
    process.stdout.write(`${isComplete(loadSession(args.sessionPath)) ? "true" : "false"}\n`);
    return;
  }
  throw new Error("Usage: task-session.cjs get|clear|mark-completed|mark-skipped|next-student|is-complete");
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
  DEFAULT_SESSION_PATH,
  initSession,
  loadSession,
  saveSession,
  updateSession,
  nextStudentKey,
  listStudentKeys,
  listStudentKeysForSession,
  nextStudentFromSession,
  isComplete,
  markCompleted,
  markSkipped,
  markCompletedSyncDecision,
  markSkippedDecision,
  clearSession,
};
