const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const SCRIPT = path.join(__dirname, "..", "scripts", "export-result-xlsx.cjs");

function writeResult(root) {
  const resultPath = path.join(root, "result.cjs");
  fs.writeFileSync(resultPath, `module.exports = ${JSON.stringify({
    schemaVersion: 1,
    kind: "fanya_result",
    courseName: "Course A",
    assignments: [
      {
        assignmentName: "Assignment A",
        reviews: [
          { studentName: "Learner A", studentKey: "local-001", suggestedScore: 88, comment: "Clear and complete.", status: "reviewed", statusReason: "" },
        ],
        draftReviews: [
          { studentName: "Learner B", studentKey: "local-002", suggestedScore: 84, comment: "Draft only.", status: "draft" },
        ],
      },
      {
        assignmentName: "Assignment B",
        reviews: [
          { studentName: "Learner C", studentKey: "local-003", suggestedScore: 86, comment: "Solid work.", status: "reviewed", statusReason: "" },
        ],
      },
    ],
  }, null, 2)};\n`, "utf8");
  return resultPath;
}

test("export-result-xlsx dry-run prints summary without private rows", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-xlsx-dry-run-"));
  const resultPath = writeResult(root);
  const stdout = execFileSync(process.execPath, [
    SCRIPT,
    "--result-path",
    resultPath,
    "--dry-run",
  ], { encoding: "utf8" });
  const summary = JSON.parse(stdout);

  assert.equal(summary.status, "validated_result_export");
  assert.equal(summary.sheetCount, 2);
  assert.equal(summary.reviewCount, 2);
  assert.equal(stdout.includes("Learner A"), false);
  assert.equal(stdout.includes("local-001"), false);
});

test("export-result-xlsx writes a non-empty xlsx when writer runtime is available", { skip: process.env.FANYA_SKIP_XLSX_WRITE === "1" }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-xlsx-write-"));
  const resultPath = writeResult(root);
  const out = path.join(root, "out.xlsx");
  const stdout = execFileSync(process.execPath, [
    SCRIPT,
    "--result-path",
    resultPath,
    "--out",
    out,
  ], { encoding: "utf8" });
  const summary = JSON.parse(stdout);

  assert.equal(summary.status, "exported_result_xlsx");
  assert.equal(summary.sheetCount, 2);
  assert.equal(fs.existsSync(out), true);
  assert.ok(fs.statSync(out).size > 1000);
});

test("export-result-xlsx preview option is non-blocking", { skip: process.env.FANYA_SKIP_XLSX_WRITE === "1" }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-xlsx-preview-"));
  const resultPath = writeResult(root);
  const out = path.join(root, "out.xlsx");
  const previewDir = path.join(root, "preview");
  const stdout = execFileSync(process.execPath, [
    SCRIPT,
    "--result-path",
    resultPath,
    "--out",
    out,
    "--preview-dir",
    previewDir,
  ], { encoding: "utf8" });
  const summary = JSON.parse(stdout);

  assert.equal(summary.status, "exported_result_xlsx");
  assert.equal(summary.previewDir, previewDir);
  assert.equal(Array.isArray(summary.previewPaths), true);
});
