const fs = require("node:fs");
const path = require("node:path");

const { DEFAULT_SESSION_PATH } = require("./task-session.cjs");

function cleanupReviewedWork(options) {
  const { workIndex, confirm, cwd = process.cwd(), sessionPath } = options;
  if (!confirm) throw new Error("Refusing to delete without --confirm");

  const tmpRoot = path.resolve(cwd, "tmp");
  const target = workIndex
    ? path.resolve(cwd, "tmp", `work-${workIndex}`)
    : resolveTargetFromSession(cwd, sessionPath);
  const relative = path.relative(tmpRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative) || relative === "") {
    throw new Error(`Refusing to delete unsafe target: ${target}`);
  }

  const bundleRoot = path.resolve(cwd, "tmp", "bundle");
  if (target === bundleRoot) throw new Error("Refusing to delete tmp/bundle");

  const deleted = [];
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
    deleted.push(target);
  }
  return { status: "cleaned", deleted, kept: [tmpRoot, bundleRoot] };
}

function parseArgs(argv) {
  const result = { confirm: argv.includes("--confirm") };
  const index = argv.indexOf("--work-index");
  if (index !== -1) result.workIndex = argv[index + 1];
  const sessionIndex = argv.indexOf("--session");
  if (sessionIndex !== -1) result.sessionPath = argv[sessionIndex + 1];
  return result;
}

function resolveTargetFromSession(cwd, sessionPath) {
  const resolvedSessionPath = sessionPath || path.resolve(cwd, DEFAULT_SESSION_PATH);
  const session = JSON.parse(fs.readFileSync(resolvedSessionPath, "utf8"));
  if (!session.reviewSourcePath) throw new Error("workIndex or session.reviewSourcePath is required");
  return path.resolve(cwd, session.reviewSourcePath);
}

function main(argv) {
  process.stdout.write(`${JSON.stringify(cleanupReviewedWork(parseArgs(argv)), null, 2)}\n`);
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
  cleanupReviewedWork,
};
