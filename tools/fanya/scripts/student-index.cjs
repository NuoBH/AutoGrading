const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_STUDENT_INDEX_PATH = path.join("tmp", "session", "fanya-current-student-index.json");

function saveStudentIndex(input) {
  if (!input.courseName) throw new Error("courseName is required");
  if (!input.assignmentName) throw new Error("assignmentName is required");
  const indexPath = input.indexPath || DEFAULT_STUDENT_INDEX_PATH;
  const record = {
    schemaVersion: 1,
    courseName: input.courseName,
    assignmentName: input.assignmentName,
    reviewMode: input.reviewMode || "",
    source: input.source || "",
    students: normalizeStudents(input.students || []),
  };

  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return { ...record, indexPath };
}

function loadStudentIndex(indexPath = DEFAULT_STUDENT_INDEX_PATH) {
  return JSON.parse(fs.readFileSync(indexPath, "utf8"));
}

function clearStudentIndex(indexPath = DEFAULT_STUDENT_INDEX_PATH) {
  if (fs.existsSync(indexPath)) fs.rmSync(indexPath, { force: true });
}

function studentKeysFromIndex(index) {
  return (index.students || []).map((student) => student.studentKey).filter(Boolean);
}

function normalizeStudents(students) {
  return students
    .map((student) => {
      const normalized = {
        studentName: student.studentName || "",
        studentKey: student.studentKey || "",
        statusAtImport: student.statusAtImport || "pending",
      };
      if (student.reviewUrl) normalized.reviewUrl = student.reviewUrl;
      return normalized;
    })
    .filter((student) => student.studentKey);
}

module.exports = {
  clearStudentIndex,
  DEFAULT_STUDENT_INDEX_PATH,
  loadStudentIndex,
  saveStudentIndex,
  studentKeysFromIndex,
};
