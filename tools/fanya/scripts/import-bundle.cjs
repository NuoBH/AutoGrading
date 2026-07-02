const fs = require("node:fs");
const path = require("node:path");

const { sanitizePathPart } = require("./attachment-utils.cjs");
const { extractArchive } = require("./extract-archives.cjs");
const { appendSkippedReviews, extractCompletedStudentKeys, extractSkippedStudentKeys } = require("./result-utils.cjs");
const { resolveStudentKeys } = require("./student-matcher.cjs");
const { DEFAULT_STUDENT_INDEX_PATH, saveStudentIndex } = require("./student-index.cjs");
const { initSession, nextStudentKey } = require("./task-session.cjs");
const { parseStudentFolderName } = require("./student-identity.cjs");

const ARCHIVE_EXTENSIONS = new Set([".zip", ".7z", ".rar", ".tar", ".gz"]);

function ensureBundleDir(bundleDir = path.join("tmp", "bundle")) {
  fs.mkdirSync(bundleDir, { recursive: true });
  return bundleDir;
}

function findBundleArchive({ assignmentName, bundleDir = path.join("tmp", "bundle") }) {
  ensureBundleDir(bundleDir);
  const needle = normalizeName(assignmentName);
  const matches = fs.readdirSync(bundleDir)
    .filter((name) => ARCHIVE_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .filter((name) => normalizeName(name).includes(needle))
    .map((name) => path.join(bundleDir, name));

  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(`Multiple bundle archives match "${assignmentName}": ${matches.join(", ")}`);
  }
  return matches[0];
}

function importBundle(options) {
  const assignmentName = options.assignmentName;
  const localWorkIndex = options.localWorkIndex || options.workIndex;
  const bundleDir = options.bundleDir || path.join("tmp", "bundle");
  if (!assignmentName) throw new Error("assignmentName is required");
  if (!localWorkIndex) throw new Error("localWorkIndex is required");

  const sourceZip = findBundleArchive({ assignmentName, bundleDir });
  if (!sourceZip) {
    return {
      status: "missing_bundle",
      bundleDir,
      assignmentName,
      message: `No archive in ${bundleDir} contains "${assignmentName}". Place the zip there and rerun.`,
    };
  }

  const safeAssignmentName = sanitizePathPart(assignmentName);
  const workDir = options.outputRoot || path.join("tmp", `work-${localWorkIndex}`, `bundle-${safeAssignmentName}`);
  const rawDir = path.join(workDir, "raw");
  const studentsDir = path.join(workDir, "students");
  fs.mkdirSync(workDir, { recursive: true });
  fs.rmSync(rawDir, { recursive: true, force: true });
  fs.rmSync(studentsDir, { recursive: true, force: true });
  fs.mkdirSync(rawDir, { recursive: true });
  fs.mkdirSync(studentsDir, { recursive: true });

  extractArchive(sourceZip, { outputDir: rawDir, tools: options.tools });
  const sourceStudentEntries = findStudentEntries(rawDir);
  const students = sourceStudentEntries.map((sourceEntry, index) => {
    const identity = parseStudentFolderName(studentEntryName(sourceEntry), index + 1);
    const studentDir = path.join(studentsDir, identity.directoryName);
    copyStudentEntry(sourceEntry, studentDir, options);
    return {
      index: index + 1,
      studentId: identity.studentId,
      studentName: identity.studentName,
      studentKey: identity.studentKey,
      sourceDir: sourceEntry.path,
      studentDir,
      parseWarnings: identity.parseWarnings,
    };
  });

  const completedFromResult = extractCompletedStudentKeys({
    resultPath: options.resultPath,
    assignmentName,
  });
  const skippedFromResult = extractSkippedStudentKeys({
    resultPath: options.resultPath,
    assignmentName,
  });
  const resolvedSkipped = resolveSkippedStudents(students, options);
  const skippedStudentKeys = unique([
    ...skippedFromResult,
    ...resolvedSkipped.matchedKeys,
  ]);
  if (options.resultPath && skippedStudentKeys.length > 0) {
    appendSkippedReviews({
      resultPath: options.resultPath,
      assignmentName,
      students: students.filter((student) => skippedStudentKeys.includes(student.studentKey)),
    });
  }
  const completedStudentKeys = unique([
    ...completedFromResult,
    ...(options.completedStudentKeys || []),
  ]);
  const studentKeys = students.map((student) => student.studentKey);
  const sessionPath = options.sessionPath;
  const studentIndexPath = options.studentIndexPath || studentIndexPathForSession(sessionPath);
  saveStudentIndex({
    indexPath: studentIndexPath,
    courseName: options.courseName || "",
    assignmentName,
    reviewMode: "bundle_zip",
    source: "bundle_students_dir",
    students: students.map((student) => ({
      studentName: student.studentName,
      studentKey: student.studentKey,
      statusAtImport: "pending",
    })),
  });

  const session = initSession({
    sessionPath,
    courseName: options.courseName || "",
    assignmentName,
    localWorkIndex,
    reviewMode: "bundle_zip",
    status: "needs_bundle_completed_sync_decision",
    rubricPath: options.rubricPath || "",
    resultPath: options.resultPath || "",
    reviewSourcePath: workDir,
    studentIndexPath,
    sourceZip,
    studentsDir,
    currentStudentKey: nextStudentKey({ completedStudentKeys, skippedStudentKeys }, studentKeys),
    completedStudentKeys,
    skippedStudentKeys,
  });

  return {
    status: "imported",
    assignmentName,
    localWorkIndex,
    sourceZip,
    workDir,
    rawDir,
    studentsDir,
    students,
    unmatchedSkipStudentNames: resolvedSkipped.unmatchedNames,
    sessionPath: sessionPath || path.join("tmp", "session", "fanya-current-task.json"),
    studentIndexPath,
    session,
  };
}

function studentIndexPathForSession(sessionPath) {
  if (!sessionPath) return DEFAULT_STUDENT_INDEX_PATH;
  return path.join(path.dirname(sessionPath), path.basename(DEFAULT_STUDENT_INDEX_PATH));
}

function resolveSkippedStudentKeys(students, options) {
  return resolveSkippedStudents(students, options).matchedKeys;
}

function resolveSkippedStudents(students, options) {
  return resolveStudentKeys(students, {
    skipStudentKeys: options.skipStudentKeys,
    skipStudents: options.skipStudents,
    skipStudentNames: options.skipStudentNames,
  });
}

function findStudentDirs(extractedDir) {
  return findStudentEntries(extractedDir)
    .filter((entry) => entry.kind === "directory")
    .map((entry) => entry.path);
}

function findStudentEntries(extractedDir) {
  const dirs = directChildDirs(extractedDir);
  const dirsWithFiles = dirs.filter((dir) => listFiles(dir).length > 0);

  if (dirsWithFiles.length === 1) {
    const nested = directChildDirs(dirsWithFiles[0]).filter((dir) => listFiles(dir).length > 0);
    if (nested.length > 0) return nested.map((entryPath) => ({ kind: "directory", path: entryPath }));
  }

  if (dirsWithFiles.length > 0) {
    return dirsWithFiles.map((entryPath) => ({ kind: "directory", path: entryPath }));
  }

  return directChildArchiveFiles(extractedDir)
    .map((entryPath) => ({ kind: "archive", path: entryPath }));
}

function studentEntryName(entry) {
  const base = path.basename(entry.path);
  return entry.kind === "archive" ? path.parse(base).name : base;
}

function copyStudentEntry(entry, studentDir, options = {}) {
  if (entry.kind === "directory") {
    copyDirectory(entry.path, studentDir);
    return;
  }
  fs.mkdirSync(studentDir, { recursive: true });
  extractArchive(entry.path, { outputDir: studentDir, tools: options.tools });
  flattenSingleWrapperDirectory(studentDir);
}

function flattenSingleWrapperDirectory(studentDir) {
  const entries = fs.readdirSync(studentDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const dirs = entries.filter((entry) => entry.isDirectory());
  if (files.length > 0 || dirs.length !== 1) return;

  const wrapperDir = path.join(studentDir, dirs[0].name);
  for (const entry of fs.readdirSync(wrapperDir, { withFileTypes: true })) {
    const from = path.join(wrapperDir, entry.name);
    const to = path.join(studentDir, entry.name);
    fs.renameSync(from, uniqueDestinationPath(to));
  }
  fs.rmSync(wrapperDir, { recursive: true, force: true });
}

function uniqueDestinationPath(targetPath) {
  if (!fs.existsSync(targetPath)) return targetPath;
  const parsed = path.parse(targetPath);
  for (let index = 2; ; index += 1) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
}

function copyDirectory(fromDir, toDir) {
  fs.mkdirSync(toDir, { recursive: true });
  for (const entry of fs.readdirSync(fromDir, { withFileTypes: true })) {
    const from = path.join(fromDir, entry.name);
    const to = path.join(toDir, entry.name);
    if (entry.isDirectory()) copyDirectory(from, to);
    if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

function directChildDirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name));
}

function directChildArchiveFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && ARCHIVE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(dir, entry.name));
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(fullPath);
    return entry.isFile() ? [fullPath] : [];
  });
}

function normalizeName(value) {
  return sanitizePathPart(value).toLowerCase().replace(/\s+/g, "");
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--assignment") {
      args.assignmentName = value;
      index += 1;
    } else if (key === "--work-index" || key === "--local-work-index") {
      args.localWorkIndex = value;
      index += 1;
    } else if (key === "--course") {
      args.courseName = value;
      index += 1;
    } else if (key === "--bundle-dir") {
      args.bundleDir = value;
      index += 1;
    } else if (key === "--rubric-path") {
      args.rubricPath = value;
      index += 1;
    } else if (key === "--result-path") {
      args.resultPath = value;
      index += 1;
    } else if (key === "--skip-keys") {
      args.skipStudentKeys = value.split(",").map((item) => item.trim()).filter(Boolean);
      index += 1;
    } else if (key === "--skip-students") {
      args.skipStudents = value.split(",").map((item) => item.trim()).filter(Boolean);
      index += 1;
    }
  }
  return args;
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function main(argv) {
  const result = importBundle(parseArgs(argv));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === "missing_bundle") process.exitCode = 2;
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
  ensureBundleDir,
  findBundleArchive,
  findStudentDirs,
  importBundle,
  normalizeName,
  resolveSkippedStudents,
  resolveSkippedStudentKeys,
};
