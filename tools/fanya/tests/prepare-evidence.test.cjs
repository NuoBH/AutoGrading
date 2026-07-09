const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildReviewTextBundle,
  collectFiles,
  prepareEvidence,
  videoSampleSeconds,
} = require("../scripts/prepare-evidence.cjs");

test("collectFiles skips generated evidence directories", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-evidence-"));
  fs.writeFileSync(path.join(root, "clip.mp4"), "");
  fs.mkdirSync(path.join(root, "evidence"));
  fs.writeFileSync(path.join(root, "evidence", "frame.png"), "");

  assert.deepEqual(collectFiles(root), [path.join(root, "clip.mp4")]);
});

test("collectFiles skips web workflow metadata files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-evidence-metadata-"));
  fs.writeFileSync(path.join(root, "poster.png"), "image");
  fs.writeFileSync(path.join(root, "extracted-attachments.json"), "{}");
  fs.writeFileSync(path.join(root, "prepared-attachments.json"), "{}");

  assert.deepEqual(collectFiles(root), [path.join(root, "poster.png")]);
});

test("videoSampleSeconds uses duration-aware proportional samples for flexible counts", () => {
  assert.deepEqual(videoSampleSeconds({ videoFrameCount: 6, durationSeconds: 60 }), [8.6, 17.1, 25.7, 34.3, 42.9, 51.4]);
  assert.deepEqual(videoSampleSeconds({ videoFrameCount: 3, durationSeconds: 20 }), [5, 10, 15]);
  assert.equal(videoSampleSeconds({ videoFrameCount: 12, durationSeconds: 120 }).length, 12);
  assert.equal(videoSampleSeconds({ videoFrameCount: 15, durationSeconds: 150 }).length, 15);
});

test("prepareEvidence writes minimal review-assets inside the student evidence directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-evidence-"));
  fs.writeFileSync(path.join(root, "poster.png"), "image");
  fs.mkdirSync(path.join(root, "evidence"));
  fs.writeFileSync(path.join(root, "evidence", "design_01.png"), "rendered pdf");
  fs.writeFileSync(path.join(root, "design.pdf"), "pdf");

  const result = prepareEvidence(root, {
    tools: {
      ffmpegPath: "",
      pdftoppmPath: "",
      sevenZipPath: "",
      tarPath: "",
    },
  });

  const assetsPath = path.join(root, "evidence", "review-assets.json");
  const assets = JSON.parse(fs.readFileSync(assetsPath, "utf8"));
  assert.equal(result.evidenceComplete, true);
  assert.deepEqual(assets.externalViewable, ["../poster.png"]);
  assert.equal(assets.evidenceItems.some((item) => (
    item.kind === "image"
    && item.sourceKind === "original_image"
    && item.generated === false
    && item.path === "../poster.png"
  )), true);
  assert.equal(assets.evidenceItems.some((item) => item.kind === "pdf_page" && item.sourceKind === "pdf"), true);
  assert.equal(Object.hasOwn(assets, "manualReview"), false);
});

test("prepareEvidence reuses complete review-assets cache", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-evidence-cache-"));
  const evidenceDir = path.join(root, "evidence");
  fs.mkdirSync(evidenceDir);
  fs.writeFileSync(path.join(root, "clip.mp4"), "not a real video");
  fs.writeFileSync(path.join(evidenceDir, "clip_01.png"), "frame");
  fs.writeFileSync(path.join(evidenceDir, "clip_02.png"), "frame");
  fs.writeFileSync(path.join(evidenceDir, "clip_03.png"), "frame");
  fs.writeFileSync(path.join(evidenceDir, "review-assets.json"), JSON.stringify({
    evidenceComplete: true,
    generatedAt: "2026-06-23T00:00:00.000Z",
    externalViewable: [],
  }));

  const result = prepareEvidence(root, {
    tools: { ffmpegPath: "", pdftoppmPath: "", sevenZipPath: "", tarPath: "" },
  });

  assert.equal(result.cached, true);
  assert.equal(result.evidenceComplete, true);
});

test("prepareEvidence does not write a log when evidence is complete", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-evidence-log-"));
  const studentDir = path.join(root, "20230001-StudentA");
  fs.mkdirSync(studentDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "work.png"), "image");

  const result = prepareEvidence(studentDir, { tools: {} });
  const logPath = path.join(studentDir, "evidence", "prepare-evidence-log.json");

  assert.equal(result.evidenceComplete, true);
  assert.equal(fs.existsSync(logPath), false);
});

test("prepareEvidence log keeps manual review file reasons", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-evidence-log-"));
  const studentDir = path.join(root, "20230001-StudentA");
  fs.mkdirSync(studentDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "unknown.xyz"), "data");

  const result = prepareEvidence(studentDir, { tools: {} });
  const logPath = path.join(studentDir, "evidence", "prepare-evidence-log.json");
  const log = JSON.parse(fs.readFileSync(logPath, "utf8"));

  assert.equal(result.evidenceComplete, false);
  assert.equal(log.evidenceComplete, false);
  assert.equal(log.manualReview.length, 1);
  assert.equal(log.manualReview[0].filename, "unknown.xyz");
  assert.equal(log.manualReview[0].status, "manual_review");
  assert.match(log.manualReview[0].reason, /unsupported file type/);
});

test("prepareEvidence does not write a log for cached complete evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-evidence-log-"));
  const studentDir = path.join(root, "20230001-StudentA");
  fs.mkdirSync(studentDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "work.png"), "image");

  prepareEvidence(studentDir, { tools: {} });
  const cached = prepareEvidence(studentDir, { tools: {} });
  const logPath = path.join(studentDir, "evidence", "prepare-evidence-log.json");

  assert.equal(cached.cached, true);
  assert.equal(fs.existsSync(logPath), false);
});

test("prepareEvidence removes stale logs when evidence becomes complete", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-evidence-log-"));
  const studentDir = path.join(root, "20230001-StudentA");
  const evidenceDir = path.join(studentDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "work.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "prepare-evidence-log.json"), "{}");

  const result = prepareEvidence(studentDir, { tools: {} });

  assert.equal(result.evidenceComplete, true);
  assert.equal(fs.existsSync(path.join(evidenceDir, "prepare-evidence-log.json")), false);
});

test("cached generated evidence excludes prepare-evidence-log", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-evidence-log-"));
  const studentDir = path.join(root, "20230001-StudentA");
  fs.mkdirSync(studentDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "work.png"), "image");

  prepareEvidence(studentDir, { tools: {} });
  const cached = prepareEvidence(studentDir, { tools: {} });

  assert.equal(cached.generatedEvidence.some((file) => file.endsWith("prepare-evidence-log.json")), false);
  assert.equal(cached.generatedEvidence.some((file) => file.endsWith("review-assets.json")), false);
});

test("prepareEvidence writes a cleaned review-text bundle for text documents", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-text-bundle-"));
  const studentDir = path.join(root, "local-001-StudentA");
  fs.mkdirSync(studentDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "report.txt"), "  Title\r\n\r\nKey finding\u0000 with   spacing.  ", "utf8");

  const result = prepareEvidence(studentDir, {
    tools: { ffmpegPath: "", pdftoppmPath: "", sevenZipPath: "", tarPath: "" },
  });
  const assets = JSON.parse(fs.readFileSync(path.join(studentDir, "evidence", "review-assets.json"), "utf8"));
  const reviewTextPath = path.join(studentDir, "evidence", assets.reviewText);

  assert.equal(result.evidenceComplete, true);
  assert.equal(assets.textBundleComplete, true);
  assert.equal(assets.reviewText, "review-text.md");
  assert.equal(fs.readFileSync(reviewTextPath, "utf8").includes("Key finding with spacing."), true);
});

test("buildReviewTextBundle truncates long text sources", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-text-bundle-long-"));
  const studentDir = path.join(root, "local-001-StudentA");
  const evidenceDir = path.join(studentDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  const textPath = path.join(studentDir, "long.txt");
  fs.writeFileSync(textPath, "A".repeat(5000), "utf8");

  const result = buildReviewTextBundle({
    studentDir,
    evidenceDir,
    sourceFiles: [textPath],
    generatedEvidence: [],
  });

  assert.equal(result.relativePath, "review-text.md");
  assert.equal(fs.readFileSync(result.path, "utf8").includes("[truncated for review]"), true);
});

test("prepareEvidence extracts selectable PDF text into review text", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-pdf-text-"));
  const studentDir = path.join(root, "local-001-StudentA");
  fs.mkdirSync(studentDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "report.pdf"), "fake pdf");
  const pdftotextPath = ({ outPath }) => {
    fs.writeFileSync(outPath, "PDF reflection text for review.", "utf8");
  };

  prepareEvidence(studentDir, {
    tools: { ffmpegPath: "", pdftoppmPath: "", pdftotextPath, sevenZipPath: "", tarPath: "" },
    pdfRenderMode: "text_first",
  });

  const evidenceDir = path.join(studentDir, "evidence");
  const assets = JSON.parse(fs.readFileSync(path.join(evidenceDir, "review-assets.json"), "utf8"));
  const reviewText = fs.readFileSync(path.join(evidenceDir, "review-text.md"), "utf8");

  assert.equal(assets.evidenceItems.some((item) => item.kind === "pdf_text" && item.sourceKind === "pdf"), true);
  assert.equal(assets.textBundleComplete, true);
  assert.match(reviewText, /PDF reflection text for review/);
});

test("prepareEvidence can skip PDF page rendering for text-first document review", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-pdf-text-first-"));
  const studentDir = path.join(root, "local-001-StudentA");
  fs.mkdirSync(studentDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "essay.pdf"), "fake pdf");
  const pdftotextPath = ({ outPath }) => {
    fs.writeFileSync(outPath, "Essay text extracted from PDF.", "utf8");
  };
  const pdftoppmPath = () => {
    throw new Error("pdftoppm should not run in text_first mode when text extraction succeeds");
  };

  const result = prepareEvidence(studentDir, {
    tools: { ffmpegPath: "", pdftoppmPath, pdftotextPath, sevenZipPath: "", tarPath: "" },
    pdfRenderMode: "text_first",
  });
  const assets = JSON.parse(fs.readFileSync(path.join(studentDir, "evidence", "review-assets.json"), "utf8"));

  assert.equal(result.evidenceComplete, true);
  assert.equal(assets.evidenceItems.some((item) => item.kind === "pdf_page"), false);
  assert.equal(assets.evidenceItems.some((item) => item.kind === "pdf_text"), true);
});

test("prepareEvidence keeps PDF page rendering by default even when text extraction succeeds", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-pdf-default-render-"));
  const studentDir = path.join(root, "local-001-StudentA");
  fs.mkdirSync(studentDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "visual-report.pdf"), "fake pdf");
  const pdftotextPath = ({ outPath }) => {
    fs.writeFileSync(outPath, "Visual report text.", "utf8");
  };
  const pdftoppmPath = ({ prefix }) => {
    fs.writeFileSync(`${prefix}-1.png`, "rendered page");
  };

  prepareEvidence(studentDir, {
    tools: { ffmpegPath: "", pdftoppmPath, pdftotextPath, sevenZipPath: "", tarPath: "" },
  });
  const assets = JSON.parse(fs.readFileSync(path.join(studentDir, "evidence", "review-assets.json"), "utf8"));

  assert.equal(assets.evidenceItems.some((item) => item.kind === "pdf_text"), true);
  assert.equal(assets.evidenceItems.some((item) => item.kind === "pdf_page"), true);
});
