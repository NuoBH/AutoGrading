const fs = require("node:fs");

const { appendStudentReview, loadRecord } = require("./record-store.cjs");
const { loadStudentIndex, studentKeysFromIndex } = require("./student-index.cjs");
const {
  DEFAULT_SESSION_PATH,
  loadSession,
  markCompleted,
  markSkipped,
} = require("./task-session.cjs");

function recordReview({ sessionPath = DEFAULT_SESSION_PATH, review }) {
  const session = loadSession(sessionPath);
  const studentKeys = studentKeysForSession(session);
  const appendResult = appendStudentReview({
    resultPath: session.resultPath,
    assignmentName: session.assignmentName,
    review,
  });

  let updatedSession = session;
  let sessionUpdated = false;
  if (appendResult.appended) {
    if (review.status === "skipped") {
      updatedSession = markSkipped({ sessionPath, studentKey: review.studentKey, studentKeys });
    } else {
      updatedSession = markCompleted({ sessionPath, studentKey: review.studentKey, studentKeys });
    }
    sessionUpdated = true;
  }

  return {
    appended: appendResult.appended,
    sessionUpdated,
    studentKey: review.studentKey,
    status: review.status || "reviewed",
    nextStudentKey: updatedSession.currentStudentKey || null,
    scoreStats: scoreStats(session.resultPath, session.assignmentName),
  };
}

function studentKeysForSession(session) {
  if (!session.studentIndexPath || !fs.existsSync(session.studentIndexPath)) return [];
  return studentKeysFromIndex(loadStudentIndex(session.studentIndexPath));
}

function scoreStats(resultPath, assignmentName) {
  if (!resultPath || !fs.existsSync(resultPath)) return emptyStats();
  const record = loadRecord(resultPath);
  const assignment = (record.assignments || []).find((item) => item.assignmentName === assignmentName);
  const scores = (assignment?.reviews || [])
    .filter((review) => review.status === "reviewed" && typeof review.suggestedScore === "number")
    .map((review) => review.suggestedScore);
  const bands = { "90-100": 0, "80-89": 0, "70-79": 0, "0-69": 0 };
  for (const score of scores) {
    if (score >= 90) bands["90-100"] += 1;
    else if (score >= 80) bands["80-89"] += 1;
    else if (score >= 70) bands["70-79"] += 1;
    else bands["0-69"] += 1;
  }
  const average = scores.length
    ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2))
    : null;
  return { count: scores.length, average, bands };
}

function emptyStats() {
  return { count: 0, average: null, bands: { "90-100": 0, "80-89": 0, "70-79": 0, "0-69": 0 } };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
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
  const result = recordReview({
    sessionPath: args["session-path"] || DEFAULT_SESSION_PATH,
    review: {
      studentName: args["student-name"] || "",
      studentKey: args["student-key"],
      status: args.status || "reviewed",
      submissionSummary: args.summary || "",
      suggestedScore: args.score === undefined ? null : Number(args.score),
      comment: args.comment || "",
      statusReason: args["status-reason"] || "",
    },
  });
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
  recordReview,
  scoreStats,
};
