const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  ensureBundleDir,
  findBundleArchive,
  findStudentDirs,
  importBundle,
  normalizeName,
} = require("../scripts/import-bundle.cjs");
const { appendStudentReview, createResultRecordFile, loadRecord } = require("../scripts/record-store.cjs");

test("ensureBundleDir creates missing bundle directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-bundle-"));
  const bundleDir = path.join(root, "tmp", "bundle");
  assert.equal(fs.existsSync(bundleDir), false);
  ensureBundleDir(bundleDir);
  assert.equal(fs.existsSync(bundleDir), true);
});

test("findBundleArchive matches archive name by assignment name", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-bundle-"));
  const bundleDir = path.join(root, "bundle");
  fs.mkdirSync(bundleDir);
  fs.writeFileSync(path.join(bundleDir, "course-Assignment.zip"), "");

  assert.equal(
    findBundleArchive({ assignmentName: "Assignment", bundleDir }),
    path.join(bundleDir, "course-Assignment.zip"),
  );
});

test("findStudentDirs handles a wrapper folder around student folders", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-students-"));
  const wrapper = path.join(root, "assignment");
  const student = path.join(wrapper, "StudentA");
  fs.mkdirSync(student, { recursive: true });
  fs.writeFileSync(path.join(student, "work.mp4"), "video");

  assert.deepEqual(findStudentDirs(root), [student]);
});

test("importBundle extracts zip and writes standardized student folders", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-import-"));
  const bundleDir = path.join(root, "bundle");
  const source = path.join(root, "source");
  fs.mkdirSync(path.join(source, "20230001-StudentA"), { recursive: true });
  fs.mkdirSync(bundleDir);
  fs.writeFileSync(path.join(source, "20230001-StudentA", "work.mp4"), "video");

  const archive = path.join(bundleDir, "Assignment.zip");
  execFileSync("tar", ["-a", "-cf", archive, "-C", source, "."], { stdio: "pipe" });

  const result = importBundle({
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 4,
    bundleDir,
    outputRoot: path.join(root, "tmp", "work-4", "bundle-assignment"),
    sessionPath: path.join(root, "tmp", "session", "fanya-current-task.json"),
    tools: { sevenZipPath: "", tarPath: "tar" },
  });

  assert.equal(result.status, "imported");
  assert.equal(fs.existsSync(path.join(result.workDir, "raw")), true);
  assert.equal(fs.existsSync(path.join(result.studentsDir, "20230001-StudentA", "work.mp4")), true);
  assert.equal(fs.existsSync(result.sessionPath), true);
  assert.equal(fs.existsSync(result.studentIndexPath), true);
  assert.equal(result.session.studentIndexPath, result.studentIndexPath);
  assert.equal(result.session.status, "needs_bundle_completed_sync_decision");
  assert.deepEqual(JSON.parse(fs.readFileSync(result.studentIndexPath, "utf8")), {
    schemaVersion: 1,
    courseName: "Course",
    assignmentName: "Assignment",
    reviewMode: "bundle_zip",
    source: "bundle_students_dir",
    students: [
      {
        studentName: "StudentA",
        studentKey: "20230001",
        statusAtImport: "pending",
      },
    ],
  });
  assert.equal(Object.hasOwn(result, "manifestPath"), false);
});

test("importBundle treats direct child archives as student submissions and flattens wrappers", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-import-direct-archives-"));
  const bundleDir = path.join(root, "bundle");
  const outerSource = path.join(root, "outer-source");
  const studentSource = path.join(root, "student-source");
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.mkdirSync(path.join(studentSource, "20230001-StudentA"), { recursive: true });
  fs.writeFileSync(path.join(studentSource, "20230001-StudentA", "poster.png"), "image");

  const studentArchive = path.join(outerSource, "20230001-StudentA.zip");
  fs.mkdirSync(outerSource, { recursive: true });
  execFileSync("tar", ["-a", "-cf", studentArchive, "-C", studentSource, "."], { stdio: "pipe" });

  const bundleArchive = path.join(bundleDir, "Assignment.zip");
  execFileSync("tar", ["-a", "-cf", bundleArchive, "-C", outerSource, "."], { stdio: "pipe" });

  const result = importBundle({
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 9,
    bundleDir,
    outputRoot: path.join(root, "tmp", "work-9", "bundle-assignment"),
    sessionPath: path.join(root, "tmp", "session", "fanya-current-task.json"),
    tools: { sevenZipPath: "", tarPath: "tar" },
  });

  assert.equal(result.status, "imported");
  assert.equal(result.students.length, 1);
  assert.equal(result.students[0].studentKey, "20230001");
  assert.equal(fs.existsSync(path.join(result.studentsDir, "20230001-StudentA", "poster.png")), true);
  assert.equal(fs.existsSync(path.join(result.studentsDir, "20230001-StudentA", "20230001-StudentA")), false);
  assert.equal(fs.existsSync(path.join(result.studentsDir, "20230001-StudentA", "20230001-StudentA.zip")), false);
});

test("importBundle merges handled result records and skipped students into the task session", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-import-state-"));
  const bundleDir = path.join(root, "bundle");
  const source = path.join(root, "source");
  fs.mkdirSync(path.join(source, "20230001-StudentA"), { recursive: true });
  fs.mkdirSync(path.join(source, "20230002-StudentB"), { recursive: true });
  fs.mkdirSync(path.join(source, "20230003-StudentC"), { recursive: true });
  fs.mkdirSync(bundleDir);
  fs.writeFileSync(path.join(source, "20230001-StudentA", "work.mp4"), "video");
  fs.writeFileSync(path.join(source, "20230002-StudentB", "work.mp4"), "video");
  fs.writeFileSync(path.join(source, "20230003-StudentC", "work.mp4"), "video");

  const archive = path.join(bundleDir, "Assignment.zip");
  execFileSync("tar", ["-a", "-cf", archive, "-C", source, "."], { stdio: "pipe" });
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment",
    review: { studentName: "StudentA", studentKey: "20230001", status: "reviewed", suggestedScore: 88 },
  });

  const imported = importBundle({
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 5,
    bundleDir,
    outputRoot: path.join(root, "tmp", "work-5", "bundle-assignment"),
    sessionPath: path.join(root, "tmp", "session", "fanya-current-task.json"),
    resultPath,
    skipStudentKeys: ["20230002"],
    tools: { sevenZipPath: "", tarPath: "tar" },
  });

  assert.deepEqual(imported.session.completedStudentKeys, ["20230001"]);
  assert.deepEqual(imported.session.skippedStudentKeys, ["20230002"]);
  assert.equal(imported.session.currentStudentKey, "20230003");
  assert.equal(loadRecord(resultPath).assignments[0].reviews.find((review) => review.studentKey === "20230002").status, "skipped");
});

test("importBundle can skip students by name after extracting student folders", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-import-skip-name-"));
  const bundleDir = path.join(root, "bundle");
  const source = path.join(root, "source");
  fs.mkdirSync(path.join(source, "20230001-Alpha"), { recursive: true });
  fs.mkdirSync(path.join(source, "20230002-Beta"), { recursive: true });
  fs.mkdirSync(bundleDir);
  fs.writeFileSync(path.join(source, "20230001-Alpha", "work.mp4"), "video");
  fs.writeFileSync(path.join(source, "20230002-Beta", "work.mp4"), "video");

  const archive = path.join(bundleDir, "Assignment.zip");
  execFileSync("tar", ["-a", "-cf", archive, "-C", source, "."], { stdio: "pipe" });
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });

  const imported = importBundle({
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 7,
    bundleDir,
    outputRoot: path.join(root, "tmp", "work-7", "bundle-assignment"),
    sessionPath: path.join(root, "tmp", "session", "fanya-current-task.json"),
    resultPath,
    skipStudents: ["Beta"],
    tools: { sevenZipPath: "", tarPath: "tar" },
  });

  assert.deepEqual(imported.session.completedStudentKeys, []);
  assert.deepEqual(imported.session.skippedStudentKeys, ["20230002"]);
  assert.equal(imported.session.currentStudentKey, "20230001");
  assert.equal(loadRecord(resultPath).assignments[0].reviews.find((review) => review.studentKey === "20230002").status, "skipped");
});

test("importBundle does not write skipped records for unmatched skip names", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-import-skip-missing-"));
  const bundleDir = path.join(root, "bundle");
  const source = path.join(root, "source");
  fs.mkdirSync(path.join(source, "20230001-Alpha"), { recursive: true });
  fs.mkdirSync(bundleDir);
  fs.writeFileSync(path.join(source, "20230001-Alpha", "work.mp4"), "video");

  const archive = path.join(bundleDir, "Assignment.zip");
  execFileSync("tar", ["-a", "-cf", archive, "-C", source, "."], { stdio: "pipe" });
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });

  const imported = importBundle({
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 8,
    bundleDir,
    outputRoot: path.join(root, "tmp", "work-8", "bundle-assignment"),
    sessionPath: path.join(root, "tmp", "session", "fanya-current-task.json"),
    resultPath,
    skipStudents: ["Missing Student"],
    tools: { sevenZipPath: "", tarPath: "tar" },
  });

  assert.deepEqual(imported.session.skippedStudentKeys, []);
  assert.deepEqual(imported.unmatchedSkipStudentNames, ["missingstudent"]);
  assert.equal(imported.session.currentStudentKey, "20230001");
  assert.equal(loadRecord(resultPath).assignments[0].reviews.length, 0);
});

test("normalizeName removes spaces and unsafe separators", () => {
  assert.equal(normalizeName("Work 4: Space Story.zip"), "work4-spacestory.zip");
});
