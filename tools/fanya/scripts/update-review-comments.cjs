const fs = require("node:fs");

const { loadRecord, saveRecord } = require("./record-store.cjs");

function updateReviewComments({ resultPath, assignmentName, updatesPath, updates }) {
  if (!resultPath) throw new Error("resultPath is required");
  if (!assignmentName) throw new Error("assignmentName is required");
  const record = loadRecord(resultPath);
  const assignment = (record.assignments || []).find((item) => item.assignmentName === assignmentName);
  if (!assignment) throw new Error(`Assignment not found: ${assignmentName}`);
  const commentUpdates = updates || JSON.parse(fs.readFileSync(updatesPath, "utf8"));
  const byKey = new Map((commentUpdates || []).map((item) => [item.studentKey, item.comment]));
  const updated = [];
  for (const review of assignment.reviews || []) {
    if (!byKey.has(review.studentKey)) continue;
    review.comment = byKey.get(review.studentKey);
    updated.push(review.studentKey);
  }
  const existing = new Set((assignment.reviews || []).map((review) => review.studentKey));
  const missing = [...byKey.keys()].filter((studentKey) => !existing.has(studentKey));
  saveRecord(resultPath, record);
  return { updated, missing };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--")) continue;
    args[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const result = updateReviewComments({
    resultPath: args["result-path"],
    assignmentName: args.assignment,
    updatesPath: args.updates,
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
  updateReviewComments,
};
