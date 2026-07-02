const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { inferKind, sanitizePathPart } = require("./attachment-utils.cjs");
const { extractArchive } = require("./extract-archives.cjs");
const { extractOfficeEvidence } = require("./office-evidence.cjs");
const { resolveTools } = require("./tool-config.cjs");

const DEFAULT_VIDEO_SAMPLE_SECONDS = [1, 3, 6, 10, 15, 25, 35, 45, 60, 75, 90, 105, 120, 150, 180];
const MAX_VIDEO_FRAME_COUNT = 15;
const MAX_PDF_PAGES = 3;
const REVIEW_TEXT_FILENAME = "review-text.md";
const MAX_REVIEW_TEXT_CHARS = 12000;
const MAX_TEXT_PER_FILE_CHARS = 3000;
const REVIEW_ASSETS_FILENAME = "review-assets.json";
const PREPARE_EVIDENCE_LOG_FILENAME = "prepare-evidence-log.json";
const WORKFLOW_METADATA_FILENAMES = new Set([
  "extracted-attachments.json",
  "prepared-attachments.json",
]);

function collectFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "evidence" || entry.name.endsWith("-extracted")) return [];
      return collectFiles(fullPath);
    }
    if (!entry.isFile()) return [];
    if (WORKFLOW_METADATA_FILENAMES.has(entry.name)) return [];
    return [fullPath];
  });
}

function prepareEvidence(studentDir, options = {}) {
  const tools = options.tools || resolveTools();
  const evidenceDir = path.join(studentDir, "evidence");
  const cached = readCompleteCache(studentDir, evidenceDir);
  if (cached && isEvidenceComplete(studentDir, cached, options)) {
    const result = {
      studentDir,
      evidenceDir,
      cached: true,
      evidenceComplete: true,
      externalViewable: cached.externalViewable || [],
      generatedEvidence: listEvidenceFiles(evidenceDir),
      evidenceItems: cached.evidenceItems || [],
      manualReview: [],
    };
    writePrepareEvidenceLogIfNeeded(evidenceDir, result);
    return result;
  }

  fs.mkdirSync(evidenceDir, { recursive: true });
  const files = collectFiles(studentDir);
  const externalViewable = [];
  const generatedEvidence = [];
  const evidenceItems = [];
  const manualReview = [];

  for (const filePath of files) {
    const result = processFile(filePath, studentDir, evidenceDir, tools, options);
    if (result.externalViewable) externalViewable.push(...result.externalViewable);
    if (result.evidence) generatedEvidence.push(...result.evidence);
    if (result.evidenceItems) evidenceItems.push(...result.evidenceItems);
    if (result.status === "manual_review") manualReview.push(result);
  }

  const uniqueExternal = Array.from(new Set(externalViewable)).sort();
  const reviewText = buildReviewTextBundle({
    studentDir,
    evidenceDir,
    sourceFiles: files,
    generatedEvidence,
  });
  if (reviewText.path) generatedEvidence.push(reviewText.path);
  if (reviewText.path) {
    evidenceItems.push(evidenceItem({
      evidenceDir,
      outputPath: reviewText.path,
      sourceFile: reviewText.path,
      kind: "text_bundle",
      sourceKind: "text",
      generated: true,
    }));
  }
  const evidenceComplete = manualReview.length === 0;
  const reviewAssets = {
    schemaVersion: 2,
    evidenceComplete,
    generatedAt: new Date().toISOString(),
    externalViewable: uniqueExternal,
    generatedEvidence: generatedEvidence.map((filePath) => toRelativeEvidencePath(evidenceDir, filePath)),
    reviewText: reviewText.relativePath || "",
    textBundleComplete: reviewText.complete,
    textBundleStrategy: reviewText.strategy,
    evidenceItems,
  };
  fs.writeFileSync(
    path.join(evidenceDir, REVIEW_ASSETS_FILENAME),
    `${JSON.stringify(reviewAssets, null, 2)}\n`,
    "utf8",
  );

  const result = {
    studentDir,
    evidenceDir,
    cached: false,
    evidenceComplete,
    externalViewable: uniqueExternal,
    generatedEvidence,
    evidenceItems,
    manualReview,
  };
  writePrepareEvidenceLogIfNeeded(evidenceDir, result);
  return result;
}

function processFile(filePath, studentDir, evidenceDir, tools, options = {}) {
  const filename = path.basename(filePath);
  const kind = inferKind(path.extname(filename), filename);
  const ext = path.extname(filename).toLowerCase();

  if (kind === "video") return processVideo(filePath, evidenceDir, tools, options);
  if (kind === "image") {
    return {
      source: filePath,
      kind: "image",
      status: "ok",
      externalViewable: [toRelativeEvidencePath(evidenceDir, filePath)],
      evidence: [],
      evidenceItems: [evidenceItem({
        evidenceDir,
        outputPath: filePath,
        sourceFile: filePath,
        kind: "image",
        sourceKind: "original_image",
        generated: false,
      })],
    };
  }
  if (ext === ".pdf") return processPdf(filePath, evidenceDir, tools);
  if (ext === ".docx" || ext === ".pptx") return processOffice(filePath, evidenceDir, tools);
  if (isPlainTextExtension(ext)) return processPlainText(filePath, evidenceDir);
  if (kind === "archive") return processArchive(filePath, studentDir, evidenceDir, tools, options);

  return manualReview(filePath, kind, "unsupported file type");
}

function processPlainText(filePath, evidenceDir) {
  return {
    source: filePath,
    filename: path.basename(filePath),
    kind: "document",
    status: "ok",
    evidence: [],
    externalViewable: [toRelativeEvidencePath(evidenceDir, filePath)],
    evidenceItems: [evidenceItem({
      evidenceDir,
      outputPath: filePath,
      sourceFile: filePath,
      kind: "doc_text",
      sourceKind: "text",
      generated: false,
    })],
  };
}

function processVideo(filePath, evidenceDir, tools, options = {}) {
  const base = baseName(filePath);
  const durationSeconds = videoDurationSeconds(filePath, tools);
  const sampleSeconds = videoSampleSeconds({ videoFrameCount: options.videoFrameCount, durationSeconds });
  const expected = sampleSeconds.map((_, index) => numberedEvidencePath(evidenceDir, base, index + 1));
  if (allNonEmpty(expected)) {
    return okItem(filePath, "video", expected, {
      itemKind: "video_frame",
      sourceKind: "video",
      indexField: "frameIndex",
    });
  }

  if (!tools.ffmpegPath) return manualReview(filePath, "video", "ffmpeg not found");

  const evidence = [];
  sampleSeconds.forEach((second, index) => {
    const outPath = expected[index];
    try {
      execFileSync(tools.ffmpegPath, [
        "-y",
        "-ss",
        String(second),
        "-i",
        filePath,
        "-frames:v",
        "1",
        outPath,
      ], { stdio: "pipe" });
      if (isNonEmptyFile(outPath)) evidence.push(outPath);
    } catch {
      // Keep successful frames; short or damaged videos are handled below.
    }
  });

  return evidence.length >= Math.min(3, sampleSeconds.length)
    ? okItem(filePath, "video", evidence, {
      itemKind: "video_frame",
      sourceKind: "video",
      indexField: "frameIndex",
    })
    : manualReview(filePath, "video", "ffmpeg could not extract three frames");
}

function processPdf(filePath, evidenceDir, tools) {
  const base = baseName(filePath);
  const existing = listMatchingEvidence(evidenceDir, base);
  if (existing.length >= 1) {
    return okItem(filePath, "document", existing, {
      itemKind: "pdf_page",
      sourceKind: "pdf",
      indexField: "pageIndex",
    });
  }

  if (!tools.pdftoppmPath) return manualReview(filePath, "document", "pdftoppm not found");

  const prefix = path.join(evidenceDir, `${base}_page`);
  try {
    execFileSync(tools.pdftoppmPath, [
      "-png",
      "-f",
      "1",
      "-l",
      String(MAX_PDF_PAGES),
      filePath,
      prefix,
    ], { stdio: "pipe" });
  } catch (error) {
    return manualReview(filePath, "document", error.message);
  }

  const produced = fs.readdirSync(evidenceDir)
    .filter((name) => name.startsWith(`${base}_page-`) && name.endsWith(".png"))
    .sort();
  const evidence = produced.map((name, index) => {
    const from = path.join(evidenceDir, name);
    const to = numberedEvidencePath(evidenceDir, base, index + 1);
    fs.renameSync(from, to);
    return to;
  }).filter(isNonEmptyFile);

  return evidence.length >= 1
    ? okItem(filePath, "document", evidence, {
      itemKind: "pdf_page",
      sourceKind: "pdf",
      indexField: "pageIndex",
    })
    : manualReview(filePath, "document", "pdftoppm produced no images");
}

function processOffice(filePath, evidenceDir, tools) {
  try {
    const result = extractOfficeEvidence(filePath, evidenceDir, { tools });
    return result.status === "ok"
      ? okItem(filePath, "document", result.evidence, {
        itemKind: officeItemKind,
        sourceKind: path.extname(filePath).toLowerCase().slice(1),
      })
      : manualReview(filePath, "document", result.reason);
  } catch (error) {
    return manualReview(filePath, "document", error.message);
  }
}

function processArchive(filePath, studentDir, evidenceDir, tools, options = {}) {
  const outputDir = path.join(evidenceDir, `${baseName(filePath)}-extracted`);
  try {
    const extracted = extractArchive(filePath, { outputDir, tools });
    const nestedResults = extracted.processableFiles.map((file) => processFile(file.path, studentDir, evidenceDir, tools, options));
    const manual = [
      ...extracted.manualReview,
      ...nestedResults.filter((item) => item.status === "manual_review"),
    ];
    return manual.length
      ? manualReview(filePath, "archive", "archive extracted but some inner files need manual review")
      : {
        source: filePath,
        filename: path.basename(filePath),
        kind: "archive",
        status: "ok",
        evidence: nestedResults.flatMap((item) => item.evidence || []),
        externalViewable: nestedResults.flatMap((item) => item.externalViewable || []),
        evidenceItems: nestedResults.flatMap((item) => item.evidenceItems || []),
      };
  } catch (error) {
    return manualReview(filePath, "archive", error.message);
  }
}

function readCompleteCache(studentDir, evidenceDir) {
  const assetsPath = path.join(evidenceDir, REVIEW_ASSETS_FILENAME);
  if (!fs.existsSync(assetsPath)) return null;
  try {
    const assets = JSON.parse(fs.readFileSync(assetsPath, "utf8"));
    return assets.evidenceComplete === true ? assets : null;
  } catch {
    return null;
  }
}

function isEvidenceComplete(studentDir, assets, options = {}) {
  const evidenceDir = path.join(studentDir, "evidence");
  for (const relativePath of assets.externalViewable || []) {
    if (!isNonEmptyFile(path.resolve(evidenceDir, relativePath))) return false;
  }

  for (const filePath of collectFiles(studentDir)) {
    const filename = path.basename(filePath);
    const kind = inferKind(path.extname(filename), filename);
    const ext = path.extname(filename).toLowerCase();
    const base = baseName(filePath);
    if (kind === "video") {
      const sampleSeconds = videoSampleSeconds({ videoFrameCount: options.videoFrameCount });
      if (!allNonEmpty(sampleSeconds.map((_, index) => numberedEvidencePath(evidenceDir, base, index + 1)))) return false;
    } else if (ext === ".pdf") {
      if (listMatchingEvidence(evidenceDir, base).length < 1) return false;
    } else if (ext === ".docx" || ext === ".pptx") {
      if (!officeEvidenceExists(evidenceDir, base)) return false;
    } else if (isPlainTextExtension(ext) && assets.reviewText) {
      if (!isNonEmptyFile(path.join(evidenceDir, assets.reviewText))) return false;
    }
  }
  return true;
}

function videoSampleSeconds(input = {}) {
  const videoFrameCount = typeof input === "object" ? input.videoFrameCount : input;
  const durationSeconds = typeof input === "object" ? input.durationSeconds : null;
  const count = clampVideoFrameCount(videoFrameCount);
  if (Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return Array.from({ length: count }, (_, index) => {
      const ratio = (index + 1) / (count + 1);
      const raw = durationSeconds * ratio;
      const bounded = durationSeconds > 0.4 ? Math.max(0.2, Math.min(durationSeconds - 0.2, raw)) : raw;
      return Math.round(bounded * 10) / 10;
    });
  }
  return DEFAULT_VIDEO_SAMPLE_SECONDS.slice(0, count);
}

function clampVideoFrameCount(videoFrameCount) {
  return Math.max(1, Math.min(MAX_VIDEO_FRAME_COUNT, Number.parseInt(videoFrameCount, 10) || 3));
}

function videoDurationSeconds(filePath, tools = {}) {
  if (!tools.ffprobePath) return null;
  try {
    const stdout = execFileSync(tools.ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ], { encoding: "utf8", stdio: "pipe" });
    const duration = Number.parseFloat(stdout);
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

function buildReviewTextBundle({ studentDir, evidenceDir, sourceFiles = [], generatedEvidence = [] }) {
  const textSources = [
    ...sourceFiles.filter((filePath) => isPlainTextExtension(path.extname(filePath).toLowerCase())),
    ...generatedEvidence.filter((filePath) => /_text\.txt$/i.test(path.basename(filePath))),
  ];
  const uniqueSources = Array.from(new Set(textSources)).filter(isNonEmptyFile).sort();
  if (uniqueSources.length === 0) {
    return { path: "", relativePath: "", complete: false, strategy: "no_text_sources" };
  }

  const sections = [];
  let usedChars = 0;
  for (const filePath of uniqueSources) {
    if (usedChars >= MAX_REVIEW_TEXT_CHARS) break;
    const cleaned = cleanReviewText(readTextFile(filePath));
    if (!cleaned) continue;
    const remaining = MAX_REVIEW_TEXT_CHARS - usedChars;
    const body = truncateText(cleaned, Math.min(MAX_TEXT_PER_FILE_CHARS, remaining));
    usedChars += body.length;
    sections.push([
      `## ${path.relative(studentDir, filePath).replace(/\\/g, "/")}`,
      "",
      body,
      "",
    ].join("\n"));
  }

  if (sections.length === 0) {
    return { path: "", relativePath: "", complete: false, strategy: "text_sources_unreadable" };
  }

  const outPath = path.join(evidenceDir, REVIEW_TEXT_FILENAME);
  fs.writeFileSync(outPath, [
    "# Review Text Bundle",
    "",
    "This file combines cleaned high-value text evidence for fast review. Read it before opening lower-priority document evidence.",
    "",
    ...sections,
  ].join("\n"), "utf8");
  return {
    path: outPath,
    relativePath: REVIEW_TEXT_FILENAME,
    complete: true,
    strategy: "priority_text_sources_truncated",
  };
}

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function cleanReviewText(value) {
  return String(value || "")
    .replace(/\0/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(value, maxChars) {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 40)).trim()} ... [truncated for review]`;
}

function isPlainTextExtension(ext) {
  return [".txt", ".md", ".markdown", ".text"].includes(ext);
}

function officeEvidenceExists(evidenceDir, base) {
  return fs.existsSync(evidenceDir)
    && fs.readdirSync(evidenceDir).some((name) => (
      (name === `${base}_text.txt` || name.startsWith(`${base}_image_`))
      && isNonEmptyFile(path.join(evidenceDir, name))
    ));
}

function listEvidenceFiles(evidenceDir) {
  if (!fs.existsSync(evidenceDir)) return [];
  return fs.readdirSync(evidenceDir)
    .filter((name) => name !== REVIEW_ASSETS_FILENAME && name !== PREPARE_EVIDENCE_LOG_FILENAME)
    .map((name) => path.join(evidenceDir, name))
    .filter((filePath) => fs.statSync(filePath).isFile());
}

function writePrepareEvidenceLogIfNeeded(evidenceDir, result) {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const logPath = path.join(evidenceDir, PREPARE_EVIDENCE_LOG_FILENAME);
  if (result.evidenceComplete) {
    if (fs.existsSync(logPath)) fs.rmSync(logPath, { force: true });
    return;
  }
  fs.writeFileSync(logPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}

function listMatchingEvidence(evidenceDir, base) {
  if (!fs.existsSync(evidenceDir)) return [];
  return fs.readdirSync(evidenceDir)
    .filter((name) => new RegExp(`^${escapeRegExp(base)}_\\d{2}\\.png$`).test(name))
    .map((name) => path.join(evidenceDir, name))
    .filter(isNonEmptyFile)
    .sort();
}

function numberedEvidencePath(evidenceDir, base, index) {
  return path.join(evidenceDir, `${base}_${String(index).padStart(2, "0")}.png`);
}

function baseName(filePath) {
  return sanitizePathPart(path.parse(filePath).name);
}

function toRelativeEvidencePath(evidenceDir, filePath) {
  return path.relative(evidenceDir, filePath).replace(/\\/g, "/");
}

function allNonEmpty(files) {
  return files.every(isNonEmptyFile);
}

function isNonEmptyFile(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
}

function okItem(filePath, kind, evidence, options = {}) {
  return {
    source: filePath,
    filename: path.basename(filePath),
    kind,
    status: "ok",
    evidence,
    externalViewable: [],
    evidenceItems: evidence.map((outputPath, index) => evidenceItem({
      evidenceDir: path.dirname(outputPath),
      outputPath,
      sourceFile: filePath,
      kind: typeof options.itemKind === "function" ? options.itemKind(outputPath) : options.itemKind || kind,
      sourceKind: options.sourceKind || kind,
      generated: true,
      ...(options.indexField ? { [options.indexField]: index + 1 } : {}),
    })),
  };
}

function manualReview(filePath, kind, reason) {
  return {
    source: filePath,
    filename: path.basename(filePath),
    kind,
    status: "manual_review",
    reason,
    evidence: [],
    externalViewable: [],
    evidenceItems: [],
  };
}

function evidenceItem({
  evidenceDir,
  outputPath,
  sourceFile,
  kind,
  sourceKind,
  generated,
  frameIndex = null,
  pageIndex = null,
}) {
  return {
    path: toRelativeEvidencePath(evidenceDir, outputPath),
    absolutePath: path.resolve(outputPath),
    kind,
    sourceKind,
    sourceFile: path.resolve(sourceFile),
    sourceBasename: path.basename(sourceFile),
    generated,
    ...(frameIndex === null ? {} : { frameIndex }),
    ...(pageIndex === null ? {} : { pageIndex }),
  };
}

function officeItemKind(outputPath) {
  return /_text\.txt$/i.test(path.basename(outputPath)) ? "doc_text" : "doc_image";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function main(argv) {
  const studentDir = argv[2];
  if (!studentDir) throw new Error("Usage: node prepare-evidence.cjs <student-tmp-dir>");
  process.stdout.write(`${JSON.stringify(prepareEvidence(studentDir), null, 2)}\n`);
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
  collectFiles,
  prepareEvidence,
  processFile,
  isEvidenceComplete,
  buildReviewTextBundle,
  videoSampleSeconds,
  videoDurationSeconds,
};
