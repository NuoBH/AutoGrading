const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  clearStudentIndex,
  DEFAULT_STUDENT_INDEX_PATH,
  loadStudentIndex,
  saveStudentIndex,
  studentKeysFromIndex,
} = require("../scripts/student-index.cjs");

test("saveStudentIndex writes minimal temporary student index", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-student-index-"));
  const indexPath = path.join(root, "tmp", "session", "fanya-current-student-index.json");

  const index = saveStudentIndex({
    indexPath,
    courseName: "Course",
    assignmentName: "Assignment",
    reviewMode: "web_download",
    source: "web_roster",
    students: [
      {
        studentName: "Student A",
        studentKey: "20230001",
        statusAtImport: "pending",
        reviewUrl: "https://example.invalid/private",
        extra: "drop me",
      },
    ],
  });

  assert.equal(index.indexPath, indexPath);
  assert.equal(fs.existsSync(indexPath), true);
  assert.deepEqual(loadStudentIndex(indexPath), {
    schemaVersion: 1,
    courseName: "Course",
    assignmentName: "Assignment",
    reviewMode: "web_download",
    source: "web_roster",
    students: [
      {
        studentName: "Student A",
        studentKey: "20230001",
        statusAtImport: "pending",
        reviewUrl: "https://example.invalid/private",
      },
    ],
  });
});

test("saveStudentIndex does not invent reviewUrl for bundle students", () => {
  const index = saveStudentIndex({
    courseName: "Course",
    assignmentName: "Assignment",
    reviewMode: "bundle_zip",
    source: "bundle_students_dir",
    students: [
      {
        studentName: "Student A",
        studentKey: "20230001",
        statusAtImport: "pending",
      },
    ],
  });

  assert.equal(Object.hasOwn(index.students[0], "reviewUrl"), false);
});

test("saveStudentIndex requires course and assignment names", () => {
  assert.throws(() => saveStudentIndex({
    courseName: "",
    assignmentName: "Assignment",
    reviewMode: "bundle_zip",
    source: "bundle_students_dir",
    students: [],
  }), /courseName is required/);

  assert.throws(() => saveStudentIndex({
    courseName: "Course",
    assignmentName: "",
    reviewMode: "bundle_zip",
    source: "bundle_students_dir",
    students: [],
  }), /assignmentName is required/);
});

test("studentKeysFromIndex returns keys in index order", () => {
  assert.deepEqual(studentKeysFromIndex({
    students: [
      { studentKey: "20230001" },
      { studentKey: "" },
      { studentKey: "local-002" },
    ],
  }), ["20230001", "local-002"]);
});

test("clearStudentIndex removes only the index file and keeps directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-student-index-"));
  const sessionDir = path.join(root, "tmp", "session");
  const indexPath = path.join(sessionDir, "fanya-current-student-index.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(indexPath, "{}");

  clearStudentIndex(indexPath);

  assert.equal(fs.existsSync(indexPath), false);
  assert.equal(fs.existsSync(sessionDir), true);
});

test("default student index path stays under tmp session", () => {
  assert.equal(DEFAULT_STUDENT_INDEX_PATH, path.join("tmp", "session", "fanya-current-student-index.json"));
});
