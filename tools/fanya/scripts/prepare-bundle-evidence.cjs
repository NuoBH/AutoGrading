const fs = require("node:fs");
const path = require("node:path");

const { prepareEvidence } = require("./prepare-evidence.cjs");
const { loadRecord } = require("./record-store.cjs");
const { loadStudentIndex, studentKeysFromIndex } = require("./student-index.cjs");
const { studentKeyFromDirName } = require("./student-identity.cjs");
const { loadSession } = require("./task-session.cjs");

function prepareBundleEvidence(studentsDir, options = {}) {
  const session = loadSessionIfPresent(options.sessionPath);
  const handled = handledKeysFromSession(session);
  const entries = entriesByStudentIndex(studentsDir, session);
  const evidenceOptions = {
    ...options,
    videoFrameCount: options.videoFrameCount || videoFrameCountFromSession(session),
  };

  const skippedStudents = entries
    .filter((student) => handled.has(student.studentKey))
    .map(({ studentKey, studentDir }) => ({ studentKey, studentDir }));

  const students = entries
    .filter((student) => !handled.has(student.studentKey))
    .map(({ studentKey, studentDir }) => {
      const evidence = prepareEvidence(studentDir, evidenceOptions);
      return {
        studentKey,
        studentDir,
        evidenceComplete: evidence.evidenceComplete,
        evidenceDir: evidence.evidenceDir,
      };
    });

  return {
    studentsDir,
    students,
    skippedStudents,
    incompleteStudents: students.filter((student) => !student.evidenceComplete),
    summary: bundleEvidenceSummary({ students, skippedStudents }),
  };
}

function videoFrameCountFromSession(session) {
  if (!session?.rubricPath || !fs.existsSync(session.rubricPath)) return undefined;
  try {
    const rubric = loadRecord(session.rubricPath);
    return rubric.reviewPriority?.representativeMediaRules?.videoFrameCount;
  } catch {
    return undefined;
  }
}

function bundleEvidenceSummary({ students = [], skippedStudents = [] }) {
  const incomplete = students.filter((student) => !student.evidenceComplete);
  return {
    studentsConsidered: students.length + skippedStudents.length,
    prepared: students.length,
    skippedHandled: skippedStudents.length,
    complete: students.length - incomplete.length,
    incomplete: incomplete.length,
  };
}

function loadHandledKeys(sessionPath) {
  return handledKeysFromSession(loadSessionIfPresent(sessionPath));
}

function loadSessionIfPresent(sessionPath) {
  if (!sessionPath || !fs.existsSync(sessionPath)) return null;
  return loadSession(sessionPath);
}

function handledKeysFromSession(session) {
  if (!session) return new Set();
  return new Set([
    ...(session.completedStudentKeys || []),
    ...(session.skippedStudentKeys || []),
  ]);
}

function entriesByStudentIndex(studentsDir, session) {
  const entries = folderEntries(studentsDir);
  if (!session?.studentIndexPath || !fs.existsSync(session.studentIndexPath)) return entries;
  const byKey = new Map(entries.map((entry) => [entry.studentKey, entry]));
  return studentKeysFromIndex(loadStudentIndex(session.studentIndexPath))
    .map((key) => byKey.get(key))
    .filter(Boolean);
}

function folderEntries(studentsDir) {
  return fs.readdirSync(studentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const studentDir = path.join(studentsDir, entry.name);
      const studentKey = studentKeyFromDirName(entry.name);
      return { studentKey, studentDir, entry };
    });
}

function main(argv) {
  const studentsDir = argv[2];
  if (!studentsDir) throw new Error("Usage: node prepare-bundle-evidence.cjs <students-dir> [--session-path <path>] [--summary-only] [--json-out <path>]");
  const options = {};
  let summaryOnly = false;
  let jsonOut = "";
  for (let index = 3; index < argv.length; index += 1) {
    if (argv[index] === "--session-path") {
      options.sessionPath = argv[index + 1];
      index += 1;
    } else if (argv[index] === "--summary-only") {
      summaryOnly = true;
    } else if (argv[index] === "--json-out") {
      jsonOut = argv[index + 1];
      index += 1;
    } else if (argv[index] === "--video-frame-count") {
      options.videoFrameCount = argv[index + 1];
      index += 1;
    }
  }
  const result = prepareBundleEvidence(studentsDir, options);
  if (jsonOut) {
    fs.mkdirSync(path.dirname(jsonOut), { recursive: true });
    fs.writeFileSync(jsonOut, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  process.stdout.write(`${JSON.stringify(summaryOnly ? {
    status: "prepared_bundle_evidence",
    studentsDir: result.studentsDir,
    summary: result.summary,
    jsonOut: jsonOut || "",
  } : result, null, 2)}\n`);
}

if (require.main === module) {
  try {
    main(process.argv);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  bundleEvidenceSummary,
  prepareBundleEvidence,
  entriesByStudentIndex,
  videoFrameCountFromSession,
};
