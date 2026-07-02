const { captureWebRoster, DEFAULT_ROSTER_JSON_PATH, writeRosterJson } = require("./capture-web-roster.cjs");
const { syncWebCompletedStudents } = require("./sync-web-completed-students.cjs");
const { DEFAULT_SESSION_PATH, markCompletedSyncDecision } = require("./task-session.cjs");

async function syncBundleWebCompletedFlow(options = {}) {
  const courseName = options.courseName || options.course || "";
  const assignmentName = options.assignmentName || options.assignment;
  const studentIndexPath = options.studentIndexPath || options.indexPath;
  const resultPath = options.resultPath;
  const sessionPath = options.sessionPath || DEFAULT_SESSION_PATH;
  const rosterJsonPath = options.rosterJsonPath || DEFAULT_ROSTER_JSON_PATH;

  if (!assignmentName) throw new Error("assignmentName is required");
  if (!studentIndexPath) throw new Error("studentIndexPath is required");
  if (!resultPath) throw new Error("resultPath is required");

  const captured = await (options.captureRoster
    ? options.captureRoster()
    : captureWebRoster({ browserSession: options.browserSession || options.session, maxPages: options.maxPages }));

  const rosterPayload = writeRosterJson({
    rosterJsonPath,
    courseName,
    assignmentName,
    rows: captured.rows,
    pageCount: captured.pageCount,
  });

  const sync = syncWebCompletedStudents({
    studentIndexPath,
    resultPath,
    assignmentName,
    sessionPath,
    rosterJsonPath,
  });
  const session = markCompletedSyncDecision({ sessionPath, decision: "yes" });

  return {
    status: "synced",
    rosterJsonPath,
    rosterSummary: rosterPayload.summary,
    sync,
    sessionStatus: session.status,
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--")) continue;
    const argName = key.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (argName === "session") args.browserSession = value;
    else if (argName === "studentIndex") args.studentIndexPath = value;
    else if (argName === "assignment") args.assignmentName = value;
    else if (argName === "course") args.courseName = value;
    else args[argName] = value;
    index += 1;
  }
  return args;
}

async function main(argv) {
  const result = await syncBundleWebCompletedFlow(parseArgs(argv));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main(process.argv).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  syncBundleWebCompletedFlow,
};
