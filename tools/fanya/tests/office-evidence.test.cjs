const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  extractOfficeEvidence,
} = require("../scripts/office-evidence.cjs");

test("extractOfficeEvidence extracts docx text and media", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-docx-"));
  const source = path.join(root, "source");
  const evidenceDir = path.join(root, "evidence");
  fs.mkdirSync(path.join(source, "word", "media"), { recursive: true });
  fs.writeFileSync(path.join(source, "word", "document.xml"), "<w:t>Hello</w:t><w:t>World</w:t>");
  fs.writeFileSync(path.join(source, "word", "media", "image1.png"), "image");
  const docxPath = path.join(root, "plan.docx");
  execFileSync("tar", ["-a", "-cf", docxPath, "-C", source, "."], { stdio: "pipe" });

  const result = extractOfficeEvidence(docxPath, evidenceDir);

  assert.equal(result.status, "ok");
  assert.equal(fs.readFileSync(path.join(evidenceDir, "plan_text.txt"), "utf8"), "Hello World\n");
  assert.equal(fs.existsSync(path.join(evidenceDir, "plan_image_01.png")), true);
});

test("extractOfficeEvidence extracts pptx slide text and media", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-pptx-"));
  const source = path.join(root, "source");
  const evidenceDir = path.join(root, "evidence");
  fs.mkdirSync(path.join(source, "ppt", "slides"), { recursive: true });
  fs.mkdirSync(path.join(source, "ppt", "media"), { recursive: true });
  fs.writeFileSync(path.join(source, "ppt", "slides", "slide1.xml"), "<a:t>Slide</a:t><a:t>One</a:t>");
  fs.writeFileSync(path.join(source, "ppt", "media", "image1.jpg"), "image");
  const pptxPath = path.join(root, "deck.pptx");
  execFileSync("tar", ["-a", "-cf", pptxPath, "-C", source, "."], { stdio: "pipe" });

  const result = extractOfficeEvidence(pptxPath, evidenceDir);

  assert.equal(result.status, "ok");
  assert.equal(fs.readFileSync(path.join(evidenceDir, "deck_text.txt"), "utf8"), "Slide One\n");
  assert.equal(fs.existsSync(path.join(evidenceDir, "deck_image_01.jpg")), true);
});
