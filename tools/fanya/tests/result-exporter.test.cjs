const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildWorkbookModel,
  parseColumns,
  safeWorksheetName,
  validateWorkbookModel,
} = require("../scripts/result-exporter.cjs");

test("safeWorksheetName removes invalid characters and de-duplicates within Excel limit", () => {
  const used = new Set();

  assert.equal(safeWorksheetName("Assignment/One: Final*Submit?", used), "AssignmentOne FinalSubmit");
  assert.equal(safeWorksheetName("Assignment/One: Final*Submit?", used), "AssignmentOne FinalSubmit 2");
  assert.equal(safeWorksheetName("12345678901234567890123456789012345", new Set()).length, 31);
});

test("buildWorkbookModel exports formal reviews only by default", () => {
  const model = buildWorkbookModel({
    schemaVersion: 1,
    kind: "fanya_result",
    courseName: "Course A",
    assignments: [{
      assignmentName: "Assignment A",
      reviews: [
        { studentName: "Learner A", studentKey: "local-001", suggestedScore: 88, comment: "Clear work.", status: "reviewed", statusReason: "" },
        { studentName: "Learner B", studentKey: "local-002", suggestedScore: null, comment: "Needs manual review.", status: "manual_review", statusReason: "cannot_open_attachment" },
      ],
      draftReviews: [
        { studentName: "Learner C", studentKey: "local-003", suggestedScore: 84, comment: "Draft only.", status: "draft" },
      ],
    }],
  });

  assert.equal(model.sheets.length, 1);
  assert.deepEqual(model.sheets[0].headers, ["学生姓名", "学号/编号", "分数", "评语"]);
  assert.equal(model.sheets[0].rows.length, 2);
  assert.equal(model.sheets[0].rows[0][2], 88);
  assert.equal(model.sheets[0].rows.some((row) => row[1] === "local-003"), false);
});

test("buildWorkbookModel exports each assignment to a separate worksheet", () => {
  const model = buildWorkbookModel({
    schemaVersion: 1,
    kind: "fanya_result",
    courseName: "Course A",
    assignments: [
      { assignmentName: "Assignment A", reviews: [{ studentName: "Learner A", studentKey: "local-001", suggestedScore: 88, comment: "Good.", status: "reviewed" }] },
      { assignmentName: "Assignment B", reviews: [{ studentName: "Learner B", studentKey: "local-002", suggestedScore: 86, comment: "Solid.", status: "reviewed" }] },
    ],
  });

  assert.equal(model.sheets.length, 2);
  assert.deepEqual(model.sheets.map((sheet) => sheet.assignmentName), ["Assignment A", "Assignment B"]);
});

test("parseColumns supports a compact export", () => {
  assert.deepEqual(parseColumns("name,score,comment").map((column) => column.key), ["name", "score", "comment"]);
});

test("validateWorkbookModel reports empty assignments and missing review fields", () => {
  const model = buildWorkbookModel({
    schemaVersion: 1,
    kind: "fanya_result",
    courseName: "Course A",
    assignments: [
      { assignmentName: "Empty Assignment", reviews: [] },
      { assignmentName: "Needs QA", reviews: [{ studentName: "Learner A", studentKey: "local-001", suggestedScore: null, comment: "", status: "reviewed" }] },
    ],
  });
  const validation = validateWorkbookModel(model);

  assert.equal(validation.ok, false);
  assert.equal(validation.issues.some((issue) => issue.code === "assignment_has_no_reviews"), true);
  assert.equal(validation.issues.some((issue) => issue.code === "missing_score"), true);
  assert.equal(validation.issues.some((issue) => issue.code === "missing_comment"), true);
});
