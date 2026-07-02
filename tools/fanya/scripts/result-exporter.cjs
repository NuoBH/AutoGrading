const INVALID_SHEET_CHARS = /[:\\/?*\[\]]/g;

const COLUMN_DEFS = {
  name: { key: "name", header: "学生姓名", value: (review) => review.studentName || "" },
  key: { key: "key", header: "学号/编号", value: (review) => review.studentKey || "" },
  score: { key: "score", header: "分数", value: (review) => review.suggestedScore ?? "" },
  comment: { key: "comment", header: "评语", value: (review) => review.comment || "" },
  status: { key: "status", header: "状态", value: (review) => review.status || "reviewed" },
  statusReason: { key: "statusReason", header: "备注", value: (review) => review.statusReason || "" },
};

const DEFAULT_COLUMNS = ["name", "key", "score", "comment"];

function buildWorkbookModel(record, options = {}) {
  if (record?.kind !== "fanya_result") throw new Error("Expected fanya_result record");
  const columns = parseColumns(options.columns || DEFAULT_COLUMNS);
  const usedNames = new Set();
  const assignments = (record.assignments || [])
    .filter((assignment) => !options.assignmentName || normalizeName(assignment.assignmentName) === normalizeName(options.assignmentName));
  const sheets = assignments.map((assignment) => {
    const reviews = options.includeDrafts
      ? [...(assignment.reviews || []), ...(assignment.draftReviews || [])]
      : (assignment.reviews || []);
    return {
      assignmentName: assignment.assignmentName || "",
      sheetName: safeWorksheetName(assignment.assignmentName || "Assignment", usedNames),
      headers: columns.map((column) => column.header),
      rows: reviews.map((review) => columns.map((column) => column.value(review))),
      columns: columns.map((column) => column.key),
      reviewCount: reviews.length,
      finalReviewCount: (assignment.reviews || []).length,
      draftReviewCount: (assignment.draftReviews || []).length,
    };
  });
  return {
    schemaVersion: 1,
    source: "fanya_result_export",
    courseName: record.courseName || "",
    sheets,
  };
}

function parseColumns(input) {
  const keys = Array.isArray(input) ? input : String(input || "").split(",");
  const columns = keys.map((key) => COLUMN_DEFS[String(key).trim()]).filter(Boolean);
  if (columns.length === 0) throw new Error("No valid columns selected");
  return columns;
}

function safeWorksheetName(name, used = new Set()) {
  const base = String(name || "Sheet")
    .replace(INVALID_SHEET_CHARS, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || "Sheet";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    const tail = ` ${suffix}`;
    candidate = `${base.slice(0, 31 - tail.length)}${tail}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function validateWorkbookModel(model) {
  const issues = [];
  for (const sheet of model.sheets || []) {
    if (sheet.rows.length === 0) {
      issues.push({ code: "assignment_has_no_reviews", assignmentName: sheet.assignmentName });
    }
    const scoreIndex = sheet.headers.indexOf("分数");
    const commentIndex = sheet.headers.indexOf("评语");
    sheet.rows.forEach((row, index) => {
      if (scoreIndex !== -1 && row[scoreIndex] === "") {
        issues.push({ code: "missing_score", assignmentName: sheet.assignmentName, row: index + 2 });
      }
      if (commentIndex !== -1 && !row[commentIndex]) {
        issues.push({ code: "missing_comment", assignmentName: sheet.assignmentName, row: index + 2 });
      }
    });
  }
  return { ok: issues.length === 0, issues };
}

function normalizeName(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

module.exports = {
  DEFAULT_COLUMNS,
  buildWorkbookModel,
  parseColumns,
  safeWorksheetName,
  validateWorkbookModel,
};
