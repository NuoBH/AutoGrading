const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { inferKind } = require("./attachment-utils.cjs");
const { resolveTools } = require("./tool-config.cjs");

function extractedDirFor(archivePath) {
  const parsed = path.parse(archivePath);
  return path.join(parsed.dir, `${parsed.name}-extracted`);
}

function extractArchive(archivePath, options = {}) {
  const outputDir = options.outputDir || extractedDirFor(archivePath);
  fs.mkdirSync(outputDir, { recursive: true });

  const tools = options.tools || resolveTools();
  const sevenZip = options.sevenZip || tools.sevenZipPath;
  if (sevenZip) {
    execFileSync(sevenZip, ["x", "-y", `-o${outputDir}`, archivePath], { stdio: "pipe" });
  } else {
    const tar = options.tar || tools.tarPath || "tar";
    execFileSync(tar, ["-xf", archivePath, "-C", outputDir], { stdio: "pipe" });
  }

  return summarizeExtractedFiles(outputDir);
}

function summarizeExtractedFiles(outputDir) {
  const files = listFiles(outputDir).map((filePath) => {
    const filename = path.basename(filePath);
    return {
      path: filePath,
      filename,
      kind: inferKind(path.extname(filename), filename),
      length: fs.statSync(filePath).size,
    };
  });

  return {
    outputDir,
    files,
    processableFiles: files.filter((file) => ["document", "video", "image", "archive"].includes(file.kind)),
    manualReview: files.filter((file) => file.kind === "other"),
  };
}

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    if (entry.isFile()) return [fullPath];
    return [];
  });
}

async function main(argv) {
  const archiveArg = argv[2];
  if (!archiveArg) {
    throw new Error("Usage: node extract-archives.cjs <archive-path>");
  }

  try {
    const result = extractArchive(archiveArg);
    process.stdout.write(`${JSON.stringify({ status: "extracted", ...result }, null, 2)}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      status: "manual_review",
      archivePath: archiveArg,
      reason: error.message,
    }, null, 2)}\n`);
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main(process.argv).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  extractedDirFor,
  extractArchive,
  summarizeExtractedFiles,
};
