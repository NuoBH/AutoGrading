const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { prepareEvidence } = require("../scripts/prepare-evidence.cjs");
const { resolveTools } = require("../scripts/tool-config.cjs");

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

function makeStudentDir(prefix = "fanya-real-evidence-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function readAssets(studentDir) {
  return JSON.parse(fs.readFileSync(path.join(studentDir, "evidence", "review-assets.json"), "utf8"));
}

function readLog(studentDir) {
  return JSON.parse(fs.readFileSync(path.join(studentDir, "evidence", "prepare-evidence-log.json"), "utf8"));
}

function writePng(filePath) {
  fs.writeFileSync(filePath, PNG_BYTES);
}

function createPdf(filePath, pages) {
  const objects = [];
  const pageIds = [];
  const fontId = 3 + (pages * 2);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  for (let page = 1; page <= pages; page += 1) {
    const pageId = 2 + page;
    const contentId = 2 + pages + page;
    pageIds.push(`${pageId} 0 R`);
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    const stream = `BT /F1 12 Tf 40 100 Td (Page ${page}) Tj ET`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  }
  objects[2] = `<< /Type /Pages /Kids [${pageIds.join(" ")}] /Count ${pages} >>`;
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    if (!objects[id]) continue;
    offsets[id] = Buffer.byteLength(chunks.join(""));
    chunks.push(`${id} 0 obj\n${objects[id]}\nendobj\n`);
  }
  const xrefOffset = Buffer.byteLength(chunks.join(""));
  chunks.push(`xref\n0 ${objects.length}\n0000000000 65535 f \n`);
  for (let id = 1; id < objects.length; id += 1) {
    chunks.push(`${String(offsets[id] || 0).padStart(10, "0")} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  fs.writeFileSync(filePath, chunks.join(""), "binary");
}

function createOfficeArchive(filePath, type) {
  const root = makeStudentDir("fanya-office-fixture-");
  const source = path.join(root, "source");
  if (type === "docx") {
    fs.mkdirSync(path.join(source, "word", "media"), { recursive: true });
    fs.writeFileSync(path.join(source, "word", "document.xml"), "<w:t>Hello</w:t><w:t>Docx</w:t>");
    writePng(path.join(source, "word", "media", "image1.png"));
  } else {
    fs.mkdirSync(path.join(source, "ppt", "slides"), { recursive: true });
    fs.mkdirSync(path.join(source, "ppt", "media"), { recursive: true });
    fs.writeFileSync(path.join(source, "ppt", "slides", "slide1.xml"), "<a:t>Hello</a:t><a:t>Pptx</a:t>");
    writePng(path.join(source, "ppt", "media", "image1.png"));
  }
  execFileSync("tar", ["-a", "-cf", filePath, "-C", source, "."], { stdio: "pipe" });
}

function createZip(filePath, files) {
  const root = makeStudentDir("fanya-zip-fixture-");
  const source = path.join(root, "source");
  fs.mkdirSync(source, { recursive: true });
  for (const file of files) {
    const target = path.join(source, file.name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  }
  execFileSync("tar", ["-a", "-cf", filePath, "-C", source, "."], { stdio: "pipe" });
}

function createVideo(filePath, ffmpegPath) {
  execFileSync(ffmpegPath, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=duration=31:size=64x64:rate=1",
    "-pix_fmt",
    "yuv420p",
    filePath,
  ], { stdio: "pipe" });
}

test("prepareEvidence uses real image files as external viewable evidence", () => {
  const studentDir = makeStudentDir();
  writePng(path.join(studentDir, "poster.png"));
  fs.writeFileSync(path.join(studentDir, "photo.jpg"), "fake jpg bytes");

  const result = prepareEvidence(studentDir, { tools: {} });
  const assets = readAssets(studentDir);

  assert.equal(result.evidenceComplete, true);
  assert.deepEqual(assets.externalViewable, ["../photo.jpg", "../poster.png"]);
  assert.equal(fs.existsSync(path.join(studentDir, "evidence", "prepare-evidence-log.json")), false);
});

test("prepareEvidence renders a real multi-page PDF when pdftoppm is available", { skip: !resolveTools().pdftoppmPath }, () => {
  const tools = resolveTools();
  const studentDir = makeStudentDir();
  createPdf(path.join(studentDir, "report.pdf"), 4);

  const result = prepareEvidence(studentDir, { tools });

  assert.equal(result.evidenceComplete, true);
  assert.equal(result.generatedEvidence.length, 3);
  assert.equal(result.generatedEvidence.every((file) => fs.existsSync(file) && file.endsWith(".png")), true);
});

test("prepareEvidence marks PDF manual review when pdftoppm is unavailable", () => {
  const studentDir = makeStudentDir();
  createPdf(path.join(studentDir, "report.pdf"), 1);

  const result = prepareEvidence(studentDir, { tools: { pdftoppmPath: "" } });
  const log = readLog(studentDir);

  assert.equal(result.evidenceComplete, false);
  assert.equal(log.manualReview[0].filename, "report.pdf");
  assert.match(log.manualReview[0].reason, /pdftoppm not found/);
});

test("prepareEvidence samples a real mp4 video when ffmpeg is available", { skip: !resolveTools().ffmpegPath }, () => {
  const tools = resolveTools();
  const studentDir = makeStudentDir();
  createVideo(path.join(studentDir, "clip.mp4"), tools.ffmpegPath);

  const result = prepareEvidence(studentDir, { tools });
  const assets = readAssets(studentDir);

  assert.equal(result.evidenceComplete, true);
  assert.equal(result.generatedEvidence.length, 3);
  assert.deepEqual(result.generatedEvidence.map((file) => path.basename(file)), ["clip_01.png", "clip_02.png", "clip_03.png"]);
  assert.equal(assets.evidenceItems.some((item) => (
    item.kind === "video_frame"
    && item.sourceKind === "video"
    && item.sourceBasename.endsWith(".mp4")
    && item.frameIndex === 1
  )), true);
});

test("prepareEvidence samples a real mov video when ffmpeg is available", { skip: !resolveTools().ffmpegPath }, () => {
  const tools = resolveTools();
  const studentDir = makeStudentDir();
  createVideo(path.join(studentDir, "clip.mov"), tools.ffmpegPath);

  const result = prepareEvidence(studentDir, { tools });

  assert.equal(result.evidenceComplete, true);
  assert.equal(result.generatedEvidence.length, 3);
});

test("prepareEvidence samples flexible frames from a short video when ffprobe is available", { skip: !(resolveTools().ffmpegPath && resolveTools().ffprobePath) }, () => {
  const tools = resolveTools();
  const studentDir = makeStudentDir();
  const videoPath = path.join(studentDir, "short.mp4");
  execFileSync(tools.ffmpegPath, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=duration=6:size=64x64:rate=1",
    "-pix_fmt",
    "yuv420p",
    videoPath,
  ], { stdio: "pipe" });

  const result = prepareEvidence(studentDir, { tools, videoFrameCount: 8 });
  const assets = readAssets(studentDir);
  const frameItems = assets.evidenceItems.filter((item) => item.kind === "video_frame");

  assert.equal(result.evidenceComplete, true);
  assert.equal(frameItems.length >= 4, true);
  assert.equal(frameItems.every((item) => item.sourceBasename === "short.mp4"), true);
});

test("prepareEvidence marks video manual review when ffmpeg is unavailable", () => {
  const studentDir = makeStudentDir();
  fs.writeFileSync(path.join(studentDir, "clip.mp4"), "not a real video");

  const result = prepareEvidence(studentDir, { tools: { ffmpegPath: "" } });
  const log = readLog(studentDir);

  assert.equal(result.evidenceComplete, false);
  assert.equal(log.manualReview[0].filename, "clip.mp4");
  assert.match(log.manualReview[0].reason, /ffmpeg not found/);
});

test("prepareEvidence extracts real docx evidence through the office path", () => {
  const studentDir = makeStudentDir();
  createOfficeArchive(path.join(studentDir, "plan.docx"), "docx");

  const result = prepareEvidence(studentDir, { tools: resolveTools() });

  assert.equal(result.evidenceComplete, true);
  assert.equal(fs.existsSync(path.join(studentDir, "evidence", "plan_text.txt")), true);
  assert.equal(fs.existsSync(path.join(studentDir, "evidence", "plan_image_01.png")), true);
});

test("prepareEvidence extracts real pptx evidence through the office path", () => {
  const studentDir = makeStudentDir();
  createOfficeArchive(path.join(studentDir, "deck.pptx"), "pptx");

  const result = prepareEvidence(studentDir, { tools: resolveTools() });

  assert.equal(result.evidenceComplete, true);
  assert.equal(fs.existsSync(path.join(studentDir, "evidence", "deck_text.txt")), true);
  assert.equal(fs.existsSync(path.join(studentDir, "evidence", "deck_image_01.png")), true);
});

test("prepareEvidence exposes images inside a real zip archive as viewable evidence", () => {
  const studentDir = makeStudentDir();
  createZip(path.join(studentDir, "assets.zip"), [
    { name: "inside.png", content: PNG_BYTES },
  ]);

  const result = prepareEvidence(studentDir, { tools: { tarPath: "tar", sevenZipPath: "" } });

  assert.equal(result.evidenceComplete, true);
  assert.deepEqual(result.externalViewable, ["assets-extracted/inside.png"]);
});

test("prepareEvidence reports manual review when a real zip archive contains unsupported files", () => {
  const studentDir = makeStudentDir();
  createZip(path.join(studentDir, "assets.zip"), [
    { name: "inside.xyz", content: "unsupported" },
  ]);

  const result = prepareEvidence(studentDir, { tools: { tarPath: "tar", sevenZipPath: "" } });
  const log = readLog(studentDir);

  assert.equal(result.evidenceComplete, false);
  assert.equal(log.manualReview[0].filename, "assets.zip");
  assert.match(log.manualReview[0].reason, /inner files need manual review/);
});

test("prepareEvidence extracts a real 7z archive when 7-Zip is available", { skip: !resolveTools().sevenZipPath }, () => {
  const tools = resolveTools();
  const studentDir = makeStudentDir();
  const source = path.join(studentDir, "source");
  fs.mkdirSync(source);
  writePng(path.join(source, "inside.png"));
  execFileSync(tools.sevenZipPath, ["a", path.join(studentDir, "assets.7z"), path.join(source, "*")], { stdio: "pipe" });
  fs.rmSync(source, { recursive: true, force: true });

  const result = prepareEvidence(studentDir, { tools });

  assert.equal(result.evidenceComplete, true);
  assert.equal(result.externalViewable.some((item) => item.endsWith("inside.png")), true);
});

test("prepareEvidence sends unsupported real files to manual review", () => {
  const studentDir = makeStudentDir();
  fs.writeFileSync(path.join(studentDir, "unknown.xyz"), "unsupported");

  const result = prepareEvidence(studentDir, { tools: {} });
  const log = readLog(studentDir);

  assert.equal(result.evidenceComplete, false);
  assert.equal(log.manualReview[0].filename, "unknown.xyz");
  assert.match(log.manualReview[0].reason, /unsupported file type/);
});
