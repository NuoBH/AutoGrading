const assert = require("node:assert/strict");
const test = require("node:test");

const {
  parseStudentFolderName,
  standardStudentDirName,
} = require("../scripts/student-identity.cjs");

test("parseStudentFolderName extracts id and name from folder names", () => {
  const parsed = parseStudentFolderName("20230001-StudentA", 1);

  assert.equal(parsed.studentId, "20230001");
  assert.equal(parsed.studentName, "StudentA");
  assert.equal(parsed.studentKey, "20230001");
  assert.deepEqual(parsed.parseWarnings, []);
});

test("parseStudentFolderName assigns local id when student id is absent", () => {
  const parsed = parseStudentFolderName("StudentB", 2);

  assert.equal(parsed.studentId, "local-002");
  assert.equal(parsed.studentName, "StudentB");
  assert.equal(parsed.studentKey, "local-002");
  assert.deepEqual(parsed.parseWarnings, ["student id not found; assigned local-002"]);
});

test("standardStudentDirName starts with student id and never student-001", () => {
  assert.equal(
    standardStudentDirName({ studentId: "20230001", studentName: "Student:A" }),
    "20230001-Student-A",
  );
});
