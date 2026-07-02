const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { initWebReview } = require("../scripts/init-web-review.cjs");
const { appendStudentReview, createResultRecordFile, loadRecord } = require("../scripts/record-store.cjs");
const { loadStudentIndex } = require("../scripts/student-index.cjs");
const { loadSession } = require("../scripts/task-session.cjs");

test("initWebReview writes web index and restores handled result state", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-web-init-"));
  const assignmentName = "Assignment A";
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course A",
    assignmentName,
  });
  appendStudentReview({
    resultPath,
    assignmentName,
    review: { studentName: "Reviewed Student", studentKey: "20230001", status: "reviewed", suggestedScore: 86 },
  });
  appendStudentReview({
    resultPath,
    assignmentName,
    review: { studentName: "Manual Student", studentKey: "20230002", status: "manual_review", statusReason: "cannot_open_attachment" },
  });
  appendStudentReview({
    resultPath,
    assignmentName,
    review: { studentName: "Skipped Student", studentKey: "20230003", status: "skipped", statusReason: "user_skipped" },
  });

  const sessionPath = path.join(root, "tmp", "session", "fanya-current-task.json");
  const studentIndexPath = path.join(root, "tmp", "session", "fanya-current-student-index.json");
  const rosterJsonPath = path.join(root, "tmp", "session", "web-roster.json");

  const result = await initWebReview({
    courseName: "Course A",
    assignmentName,
    rubricPath: path.join(root, "rubric.cjs"),
    resultPath,
    sessionPath,
    studentIndexPath,
    rosterJsonPath,
    captureRoster: async () => ({
      rows: [
        { text: "20230001 Reviewed Student Completed", cells: ["20230001", "Reviewed Student", "Completed"], links: [] },
        { text: "20230002 Manual Student Completed", cells: ["20230002", "Manual Student", "Completed"], links: [] },
        { text: "20230003 Skipped Student To be reviewed", cells: ["20230003", "Skipped Student", "To be reviewed"], links: [] },
        { text: "20230004 Pending Student To be reviewed", cells: ["20230004", "Pending Student", "To be reviewed"], links: [{ text: "Review", href: "https://example.test/review-work?workAnswerId=4" }] },
      ],
      pageCount: 1,
    }),
  });

  const session = loadSession(sessionPath);
  const index = loadStudentIndex(studentIndexPath);
  assert.equal(result.reviewMode, "web_download");
  assert.equal(index.reviewMode, "web_download");
  assert.deepEqual(session.completedStudentKeys, ["20230001", "20230002"]);
  assert.deepEqual(session.skippedStudentKeys, ["20230003"]);
  assert.equal(session.currentStudentKey, "20230004");
  assert.equal(fs.existsSync(rosterJsonPath), true);
});

test("initWebReview optionally records website completed rows without overwriting existing reviews", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-web-init-sync-"));
  const assignmentName = "Assignment A";
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course A",
    assignmentName,
  });
  appendStudentReview({
    resultPath,
    assignmentName,
    review: { studentName: "Alpha Student", studentKey: "20230001", status: "reviewed", suggestedScore: 92, comment: "Keep this." },
  });
  const sessionPath = path.join(root, "tmp", "session", "fanya-current-task.json");
  const studentIndexPath = path.join(root, "tmp", "session", "fanya-current-student-index.json");

  await initWebReview({
    courseName: "Course A",
    assignmentName,
    rubricPath: path.join(root, "rubric.cjs"),
    resultPath,
    sessionPath,
    studentIndexPath,
    rosterJsonPath: path.join(root, "tmp", "session", "web-roster.json"),
    syncCompleted: true,
    captureRoster: async () => ({
      rows: [
        { text: "20230001 Alpha Student Completed", cells: ["20230001", "Alpha Student", "Completed"], links: [] },
        { text: "20230002 Beta Student Completed", cells: ["20230002", "Beta Student", "Completed"], links: [] },
      ],
      pageCount: 1,
    }),
  });

  const reviews = loadRecord(resultPath).assignments[0].reviews;
  assert.equal(reviews.length, 2);
  assert.equal(reviews[0].comment, "Keep this.");
  assert.equal(reviews[1].statusReason, "already_completed_on_website");
  assert.deepEqual(loadSession(sessionPath).completedStudentKeys, ["20230001", "20230002"]);
});
