const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { recordReview } = require("../scripts/record-review.cjs");
const { createResultRecordFile, loadRecord } = require("../scripts/record-store.cjs");
const { initSession, loadSession } = require("../scripts/task-session.cjs");

function setupTask() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-record-review-"));
  const sessionDir = path.join(root, "tmp", "session");
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  const studentIndexPath = path.join(sessionDir, "fanya-current-student-index.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(studentIndexPath, JSON.stringify({
    schemaVersion: 1,
    courseName: "Course",
    assignmentName: "Assignment",
    reviewMode: "bundle_zip",
    source: "bundle_students_dir",
    students: [
      { studentName: "Student A", studentKey: "20230001", statusAtImport: "pending" },
      { studentName: "Student B", studentKey: "20230002", statusAtImport: "pending" },
    ],
  }));
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    rubricPath: "rubrics/Course/Assignment-rubric.cjs",
    resultPath,
    reviewSourcePath: "tmp/work-1",
    studentIndexPath,
    currentStudentKey: "20230001",
  });
  return { root, sessionPath, resultPath };
}

test("recordReview writes result and marks reviewed student completed", () => {
  const { sessionPath, resultPath } = setupTask();

  const result = recordReview({
    sessionPath,
    review: {
      studentName: "Student A",
      studentKey: "20230001",
      status: "reviewed",
      submissionSummary: "video frames",
      suggestedScore: 86,
      comment: "Work is complete and generally clear.",
      statusReason: "",
    },
  });

  const record = loadRecord(resultPath);
  const session = loadSession(sessionPath);
  assert.equal(result.appended, true);
  assert.equal(record.assignments[0].reviews[0].studentKey, "20230001");
  assert.deepEqual(session.completedStudentKeys, ["20230001"]);
  assert.deepEqual(session.skippedStudentKeys, []);
  assert.equal(session.currentStudentKey, "20230002");
  assert.equal(result.nextStudentKey, "20230002");
  assert.equal(result.scoreStats.count, 1);
  assert.equal(result.scoreStats.bands["80-89"], 1);
});

test("recordReview treats manual_review as completed", () => {
  const { sessionPath } = setupTask();

  const result = recordReview({
    sessionPath,
    review: {
      studentName: "Student A",
      studentKey: "20230001",
      status: "manual_review",
      submissionSummary: "",
      suggestedScore: null,
      comment: "Needs manual review.",
      statusReason: "cannot_open_attachment",
    },
  });

  const session = loadSession(sessionPath);
  assert.equal(result.status, "manual_review");
  assert.deepEqual(session.completedStudentKeys, ["20230001"]);
  assert.deepEqual(session.skippedStudentKeys, []);
});

test("recordReview treats skipped as skipped only", () => {
  const { sessionPath } = setupTask();

  const result = recordReview({
    sessionPath,
    review: {
      studentName: "Student A",
      studentKey: "20230001",
      status: "skipped",
      submissionSummary: "-",
      suggestedScore: null,
      comment: "Skipped.",
      statusReason: "user_skipped",
    },
  });

  const session = loadSession(sessionPath);
  assert.equal(result.status, "skipped");
  assert.deepEqual(session.completedStudentKeys, []);
  assert.deepEqual(session.skippedStudentKeys, ["20230001"]);
});

test("recordReview does not advance session when result already exists", () => {
  const { sessionPath } = setupTask();
  recordReview({
    sessionPath,
    review: {
      studentName: "Student A",
      studentKey: "20230001",
      status: "reviewed",
      submissionSummary: "video",
      suggestedScore: 86,
      comment: "Original.",
      statusReason: "",
    },
  });

  const duplicate = recordReview({
    sessionPath,
    review: {
      studentName: "Student A",
      studentKey: "20230001",
      status: "reviewed",
      submissionSummary: "video",
      suggestedScore: 70,
      comment: "Duplicate.",
      statusReason: "",
    },
  });

  assert.equal(duplicate.appended, false);
  assert.equal(duplicate.sessionUpdated, false);
});
