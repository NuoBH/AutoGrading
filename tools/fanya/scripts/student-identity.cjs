const { sanitizePathPart } = require("./attachment-utils.cjs");

function parseStudentFolderName(folderName, index) {
  const raw = String(folderName ?? "").trim();
  const idMatch = raw.match(/\d{6,}/);
  const studentId = idMatch ? idMatch[0] : `local-${String(index).padStart(3, "0")}`;
  const parseWarnings = [];
  if (!idMatch) parseWarnings.push(`student id not found; assigned ${studentId}`);

  const withoutId = idMatch ? raw.replace(idMatch[0], "") : raw;
  const studentName = sanitizeStudentName(withoutId) || "unknown";

  return {
    studentId,
    studentName,
    studentKey: studentId,
    directoryName: standardStudentDirName({ studentId, studentName }),
    parseWarnings,
  };
}

function sanitizeStudentName(value) {
  return sanitizePathPart(value)
    .replace(/^[-_\s]+|[-_\s]+$/g, "")
    .replace(/^untitled$/i, "");
}

function standardStudentDirName({ studentId, studentName }) {
  const safeName = sanitizeStudentName(studentName) || "unknown";
  return `${studentId}-${safeName}`;
}

function studentKeyFromDirName(dirName) {
  const value = String(dirName ?? "");
  const localMatch = value.match(/^local-\d{3}/);
  if (localMatch) return localMatch[0];
  const idMatch = value.match(/\d{6,}/);
  return idMatch ? idMatch[0] : "";
}

module.exports = {
  parseStudentFolderName,
  sanitizeStudentName,
  standardStudentDirName,
  studentKeyFromDirName,
};
