const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { sanitizePathPart } = require("./attachment-utils.cjs");
const { resolveTools } = require("./tool-config.cjs");

function extractOfficeEvidence(filePath, evidenceDir, options = {}) {
  const tools = options.tools || resolveTools();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-office-"));
  fs.mkdirSync(evidenceDir, { recursive: true });

  const sevenZip = tools.sevenZipPath;
  if (sevenZip) {
    execFileSync(sevenZip, ["x", "-y", `-o${tempDir}`, filePath], { stdio: "pipe" });
  } else {
    const tar = tools.tarPath || "tar";
    execFileSync(tar, ["-xf", filePath, "-C", tempDir], { stdio: "pipe" });
  }

  const ext = path.extname(filePath).toLowerCase();
  const base = sanitizePathPart(path.parse(filePath).name);
  const text = ext === ".pptx" ? extractPptxText(tempDir) : extractDocxText(tempDir);
  const evidence = [];

  if (text.trim()) {
    const textPath = path.join(evidenceDir, `${base}_text.txt`);
    fs.writeFileSync(textPath, `${text.trim()}\n`, "utf8");
    evidence.push(textPath);
  }

  const mediaRoot = ext === ".pptx"
    ? path.join(tempDir, "ppt", "media")
    : path.join(tempDir, "word", "media");
  if (fs.existsSync(mediaRoot)) {
    const mediaFiles = fs.readdirSync(mediaRoot)
      .filter((name) => fs.statSync(path.join(mediaRoot, name)).isFile())
      .sort();
    mediaFiles.forEach((name, index) => {
      const outPath = path.join(
        evidenceDir,
        `${base}_image_${String(index + 1).padStart(2, "0")}${path.extname(name).toLowerCase()}`,
      );
      fs.copyFileSync(path.join(mediaRoot, name), outPath);
      evidence.push(outPath);
    });
  }

  return evidence.length
    ? { status: "ok", evidence }
    : { status: "manual_review", evidence: [], reason: "no text or media extracted" };
}

function extractDocxText(root) {
  return extractTextFromXmlFiles([path.join(root, "word", "document.xml")]);
}

function extractPptxText(root) {
  const slidesDir = path.join(root, "ppt", "slides");
  if (!fs.existsSync(slidesDir)) return "";
  const slideFiles = fs.readdirSync(slidesDir)
    .filter((name) => /^slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
    .map((name) => path.join(slidesDir, name));
  return extractTextFromXmlFiles(slideFiles);
}

function extractTextFromXmlFiles(files) {
  const parts = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const xml = fs.readFileSync(file, "utf8");
    for (const match of xml.matchAll(/<[^:>]*:?t[^>]*>(.*?)<\/[^:>]*:?t>/g)) {
      const text = decodeXml(match[1]).trim();
      if (text) parts.push(text);
    }
  }
  return parts.join(" ");
}

function decodeXml(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

module.exports = {
  extractOfficeEvidence,
  extractDocxText,
  extractPptxText,
};
