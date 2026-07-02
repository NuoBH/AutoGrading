const fs = require("node:fs");

const { upsertDraftReviews } = require("./record-store.cjs");

function main(argv) {
  const resultPath = argValue(argv, "--result-path");
  const assignmentName = argValue(argv, "--assignment");
  const draftsPath = argValue(argv, "--drafts");
  if (!resultPath) throw new Error("--result-path is required");
  if (!assignmentName) throw new Error("--assignment is required");
  if (!draftsPath) throw new Error("--drafts is required");

  const drafts = JSON.parse(fs.readFileSync(draftsPath, "utf8"));
  const result = upsertDraftReviews({
    resultPath,
    assignmentName,
    drafts,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function argValue(argv, key) {
  const index = argv.indexOf(key);
  return index === -1 ? "" : argv[index + 1];
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
  main,
};
