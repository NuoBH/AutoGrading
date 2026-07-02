const { sanitizePathPart } = require("./attachment-utils.cjs");

function resolveStudentKeys(students, options = {}) {
  const explicitKeys = new Set(options.studentKeys || options.skipStudentKeys || []);
  const names = (options.studentNames || options.skipStudents || options.skipStudentNames || [])
    .map((value) => normalizeStudentMatcher(value))
    .filter(Boolean);
  const matchedKeys = [];
  const matchedNames = new Set();

  for (const student of students || []) {
    if (!student?.studentKey) continue;
    if (explicitKeys.has(student.studentKey)) {
      matchedKeys.push(student.studentKey);
      continue;
    }

    const haystack = normalizeStudentMatcher([
      student.studentName,
      student.studentId,
      student.studentKey,
      student.directoryName,
      student.studentDir,
      student.rawText,
    ].filter(Boolean).join(" "));

    for (const name of names) {
      if (haystack.includes(name)) {
        matchedKeys.push(student.studentKey);
        matchedNames.add(name);
      }
    }
  }

  return {
    matchedKeys: unique(matchedKeys),
    unmatchedNames: names.filter((name) => !matchedNames.has(name)),
  };
}

function normalizeStudentMatcher(value) {
  return sanitizePathPart(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[-_]+/g, "");
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

module.exports = {
  normalizeStudentMatcher,
  resolveStudentKeys,
};
