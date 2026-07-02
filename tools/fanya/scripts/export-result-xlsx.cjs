const path = require("node:path");

const { sanitizePathPart } = require("./attachment-utils.cjs");
const { loadRecord } = require("./record-store.cjs");
const { buildWorkbookModel, validateWorkbookModel } = require("./result-exporter.cjs");
const { writeXlsxFromModel } = require("./xlsx-writer.cjs");

async function exportResultXlsx(options) {
  if (!options.resultPath) throw new Error("resultPath is required");
  const record = loadRecord(options.resultPath);
  const model = buildWorkbookModel(record, {
    assignmentName: options.assignment,
    columns: options.columns,
    includeDrafts: options.includeDrafts,
  });
  const validation = validateWorkbookModel(model);
  const outPath = options.out || path.join(
    options.outDir || "outputs",
    `${sanitizePathPart(model.courseName || "fanya-result")}-作业评价汇总.xlsx`,
  );
  const summary = {
    status: options.dryRun ? "validated_result_export" : "exported_result_xlsx",
    resultPath: options.resultPath,
    outPath,
    sheetCount: model.sheets.length,
    reviewCount: model.sheets.reduce((sum, sheet) => sum + sheet.reviewCount, 0),
    validation,
  };
  if (options.dryRun) return summary;
  const written = writeXlsxFromModel({ model, outPath, previewDir: options.previewDir || "" });
  return { ...summary, ...written };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--include-drafts") {
      args.includeDrafts = true;
    } else if (key === "--dry-run") {
      args.dryRun = true;
    } else if (key?.startsWith("--")) {
      args[key.slice(2)] = argv[index + 1];
      index += 1;
    }
  }
  return {
    resultPath: args["result-path"],
    out: args.out,
    outDir: args["out-dir"],
    previewDir: args["preview-dir"],
    assignment: args.assignment,
    columns: args.columns,
    includeDrafts: Boolean(args.includeDrafts),
    dryRun: Boolean(args.dryRun),
  };
}

async function main(argv) {
  const options = parseArgs(argv);
  if (!options.resultPath) {
    throw new Error("Usage: node export-result-xlsx.cjs --result-path <result.cjs> [--out <file.xlsx>] [--out-dir outputs] [--assignment <name>] [--columns name,key,score,comment,status,statusReason] [--include-drafts] [--preview-dir <dir>] [--dry-run]");
  }
  const result = await exportResultXlsx(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (require.main === module) {
  main(process.argv).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  exportResultXlsx,
  parseArgs,
};
