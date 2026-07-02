const fs = require("node:fs");
const path = require("node:path");

const { DEFAULT_SESSION_PATH } = require("./task-session.cjs");

function cleanupReviewedBundle(sessionPath, options = {}) {
  if (!options.confirm) {
    throw new Error("Refusing to delete without --confirm");
  }

  const cwd = options.cwd || process.cwd();
  const resolvedSessionPath = sessionPath || path.resolve(cwd, DEFAULT_SESSION_PATH);
  const session = JSON.parse(fs.readFileSync(resolvedSessionPath, "utf8"));
  const bundleRoot = path.resolve(cwd, options.bundleDir || path.join("tmp", "bundle"));
  const tmpRoot = path.resolve(cwd, "tmp");
  const sourceZip = path.resolve(cwd, session.sourceZip);
  const extractedDir = path.resolve(cwd, session.reviewSourcePath);

  assertWithin(sourceZip, bundleRoot, "sourceZip");
  assertWithin(extractedDir, tmpRoot, "extractedDir");
  if (path.resolve(extractedDir) === tmpRoot || path.resolve(extractedDir) === bundleRoot) {
    throw new Error("Refusing to delete tmp root or bundle root");
  }

  const deleted = [];
  if (fs.existsSync(sourceZip)) {
    fs.rmSync(sourceZip, { force: true });
    deleted.push(sourceZip);
  }
  if (fs.existsSync(extractedDir)) {
    fs.rmSync(extractedDir, { recursive: true, force: true });
    deleted.push(extractedDir);
  }

  return {
    status: "cleaned",
    deleted,
    kept: [bundleRoot],
  };
}

function assertWithin(target, root, label) {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} is outside allowed root: ${target}`);
  }
}

function parseArgs(argv) {
  return {
    manifestPath: argv[2]?.startsWith("--") ? undefined : argv[2],
    confirm: argv.includes("--confirm"),
  };
}

function main(argv) {
  const { manifestPath, confirm } = parseArgs(argv);
  process.stdout.write(`${JSON.stringify(cleanupReviewedBundle(manifestPath, { confirm }), null, 2)}\n`);
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
  assertWithin,
  cleanupReviewedBundle,
};
