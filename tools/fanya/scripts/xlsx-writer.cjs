const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function writeXlsxFromModel({ model, outPath, previewDir = "" }) {
  if (!model) throw new Error("model is required");
  if (!outPath) throw new Error("outPath is required");
  const nodeModules = findArtifactToolNodeModules();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-xlsx-writer-"));
  const inputPath = path.join(workDir, "workbook-model.json");
  const builderPath = path.join(workDir, "build-workbook.mjs");
  const linkPath = path.join(workDir, "node_modules");
  fs.writeFileSync(inputPath, `${JSON.stringify({ model, outPath, previewDir }, null, 2)}\n`, "utf8");
  linkNodeModules(nodeModules, linkPath);
  fs.writeFileSync(builderPath, builderSource(), "utf8");
  try {
    const stdout = execFileSync(process.execPath, [builderPath, inputPath], { encoding: "utf8", cwd: workDir });
    return parseLastJsonLine(stdout);
  } catch (error) {
    const detail = String(error.stderr || error.stdout || error.message).trim();
    const wrapped = new Error(`xlsx_writer_unavailable: ${detail}`);
    wrapped.code = "xlsx_writer_unavailable";
    throw wrapped;
  }
}

function parseLastJsonLine(stdout) {
  const lines = String(stdout || "").trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {}
  }
  throw new Error("xlsx writer did not print a JSON summary");
}

function renderWorkbookPreview({ workbookPath, model, previewDir }) {
  return {
    workbookPath,
    previewDir: previewDir || "",
    previewPaths: [],
    previewWarning: model ? "preview_not_requested_or_not_available" : "preview_not_available",
  };
}

function findArtifactToolNodeModules() {
  const candidates = [
    process.env.FANYA_NODE_MODULES,
    process.env.CODEX_NODE_MODULES,
    path.join(os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "@oai", "artifact-tool", "package.json"))) return candidate;
  }
  throw new Error("xlsx_writer_unavailable: @oai/artifact-tool node_modules not found. Set FANYA_NODE_MODULES to the bundled node_modules path.");
}

function linkNodeModules(target, linkPath) {
  if (fs.existsSync(linkPath)) return;
  try {
    fs.symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
  } catch {
    fs.cpSync(target, linkPath, { recursive: true });
  }
}

function builderSource() {
  return `
import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const inputPath = process.argv[2];
const payload = JSON.parse(await fs.readFile(inputPath, "utf8"));
const { model, outPath, previewDir } = payload;
const workbook = Workbook.create();

for (const sheetModel of model.sheets) {
  const sheet = workbook.worksheets.add(sheetModel.sheetName);
  const values = [sheetModel.headers, ...sheetModel.rows];
  const rowCount = Math.max(values.length, 1);
  const colCount = Math.max(sheetModel.headers.length, 1);
  const range = sheet.getRangeByIndexes(0, 0, rowCount, colCount);
  range.values = values;
  const header = sheet.getRangeByIndexes(0, 0, 1, colCount);
  header.format = {
    fill: "#1F4E78",
    font: { bold: true, color: "#FFFFFF" },
  };
  range.format.borders = { preset: "all", style: "thin", color: "#D9E2F3" };
  sheet.freezePanes.freezeRows(1);
  for (let col = 0; col < sheetModel.headers.length; col += 1) {
    const headerText = sheetModel.headers[col];
    const columnRange = sheet.getRangeByIndexes(0, col, rowCount, 1);
    if (headerText === "分数") {
      columnRange.format.columnWidth = 10;
      if (rowCount > 1) sheet.getRangeByIndexes(1, col, rowCount - 1, 1).format.numberFormat = "0";
    } else if (headerText === "评语") {
      columnRange.format.columnWidth = 60;
      columnRange.format.wrapText = true;
    } else {
      columnRange.format.columnWidth = 18;
    }
  }
  if (rowCount > 1) {
    try {
      const tableName = "ReviewTable_" + String(sheetModel.sheetName).replace(/[^A-Za-z0-9_]/g, "_").slice(0, 20);
      sheet.tables.add(sheet.getRangeByIndexes(0, 0, rowCount, colCount), true, tableName);
    } catch {}
  }
}

await fs.mkdir(path.dirname(outPath), { recursive: true });
const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outPath);

const previewPaths = [];
let previewWarning = "";
if (previewDir) {
  try {
    await fs.mkdir(previewDir, { recursive: true });
    for (const sheetModel of model.sheets) {
      const preview = await workbook.render({ sheetName: sheetModel.sheetName, autoCrop: "all", scale: 1, format: "png" });
      const previewPath = path.join(previewDir, sheetModel.sheetName.replace(/[^A-Za-z0-9\\u4e00-\\u9fa5_-]/g, "_") + ".png");
      await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
      previewPaths.push(previewPath);
    }
  } catch (error) {
    previewWarning = "preview_not_available: " + error.message;
  }
}

process.stdout.write(JSON.stringify({
  outPath,
  sheetCount: model.sheets.length,
  rowCount: model.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
  previewDir: previewDir || "",
  previewPaths,
  ...(previewWarning ? { previewWarning } : {}),
}) + "\\n");
`;
}

module.exports = {
  findArtifactToolNodeModules,
  parseLastJsonLine,
  renderWorkbookPreview,
  writeXlsxFromModel,
};
