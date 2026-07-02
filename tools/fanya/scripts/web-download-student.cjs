const fs = require("node:fs");
const path = require("node:path");

const { prepareAttachments } = require("./prepare-attachments.cjs");

function prepareWebStudentDownload({ statePath, attachmentsPath, manifestPath }) {
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const extracted = JSON.parse(fs.readFileSync(attachmentsPath, "utf8"));
  if (state.reviewMode !== "web_download") {
    throw new Error("prepareWebStudentDownload only supports web_download mode");
  }
  if (!state.currentStudentKey) throw new Error("currentStudentKey is required");
  if (!state.studentDir) throw new Error("studentDir is required");

  const plan = prepareAttachments({
    workIndex: 0,
    studentIndex: 0,
    student: {
      name: state.student?.studentName || extracted.student?.name || "",
      id: state.currentStudentKey,
      studentName: state.student?.studentName || extracted.student?.name || "",
      studentKey: state.currentStudentKey,
    },
    attachments: extracted.attachments || [],
  });
  plan.tmpDir = state.studentDir;
  plan.webReviewUrl = state.webReviewUrl || "";

  const outputPath = manifestPath || path.join(state.studentDir, "prepared-attachments.json");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  return { ...plan, manifestPath: outputPath };
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
  const result = prepareWebStudentDownload({
    statePath: args.state,
    attachmentsPath: args.attachments,
    manifestPath: args.out,
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
  prepareWebStudentDownload,
};
