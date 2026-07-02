const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  extractedDirFor,
  extractArchive,
  summarizeExtractedFiles,
} = require("../scripts/extract-archives.cjs");
const { resolveTools } = require("../scripts/tool-config.cjs");

test("extractedDirFor creates a sibling extracted directory", () => {
  assert.equal(
    extractedDirFor("tmp\\work-4\\student-3\\01-source.zip"),
    "tmp\\work-4\\student-3\\01-source-extracted",
  );
});

test("summarizeExtractedFiles classifies readable archive contents", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-extract-"));
  fs.writeFileSync(path.join(root, "clip.mov"), "video");
  fs.writeFileSync(path.join(root, "plan.docx"), "doc");
  fs.writeFileSync(path.join(root, "notes.unknown"), "unknown");

  const summary = summarizeExtractedFiles(root);

  assert.equal(summary.files.length, 3);
  assert.equal(summary.processableFiles.length, 2);
  assert.equal(summary.manualReview.length, 1);
});

test("extractArchive extracts a real zip archive", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-zip-"));
  const source = path.join(root, "source");
  const archive = path.join(root, "sample.zip");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "clip.mp4"), "video");
  fs.writeFileSync(path.join(source, "plan.pdf"), "pdf");

  execFileSync("tar", ["-a", "-cf", archive, "-C", source, "."], { stdio: "pipe" });
  const summary = extractArchive(archive, { tools: { sevenZipPath: "", tarPath: "tar" } });

  assert.equal(summary.processableFiles.length, 2);
});

test("extractArchive extracts a real 7z archive when 7-Zip is available", { skip: !resolveTools().sevenZipPath }, () => {
  const tools = resolveTools();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-7z-"));
  const source = path.join(root, "source");
  const archive = path.join(root, "sample.7z");
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, "clip.mov"), "video");

  execFileSync(tools.sevenZipPath, ["a", archive, path.join(source, "*")], { stdio: "pipe" });
  const summary = extractArchive(archive, { tools });

  assert.equal(summary.processableFiles.length, 1);
  assert.equal(summary.processableFiles[0].kind, "video");
});
