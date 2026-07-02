const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { repairTask } = require("../scripts/repair-task.cjs");
const {
  appendStudentReview,
  assignmentDraftReviews,
  createResultRecordFile,
  createRubricRecordFile,
  loadRecord,
  upsertDraftReviews,
} = require("../scripts/record-store.cjs");
const { saveStudentIndex, loadStudentIndex } = require("../scripts/student-index.cjs");
const { initSession, loadSession } = require("../scripts/task-session.cjs");

function makeRoot(prefix = "fanya-repair-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeBundleArchive({ root, bundleDir = path.join(root, "tmp", "bundle"), assignmentName = "Assignment A", folders }) {
  const source = path.join(root, "source");
  fs.mkdirSync(source, { recursive: true });
  for (const folder of folders) {
    const dir = path.join(source, folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "work.txt"), "work");
  }
  fs.mkdirSync(bundleDir, { recursive: true });
  const archive = path.join(bundleDir, `${assignmentName}.zip`);
  execFileSync("tar", ["-a", "-cf", archive, "-C", source, "."], { stdio: "pipe" });
  return archive;
}

function createRecords({ root, assignmentName = "Assignment A" }) {
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course A",
    assignmentName,
  });
  const rubricPath = createRubricRecordFile({
    rubricPath: path.join(root, "rubric.cjs"),
    courseName: "Course A",
    assignmentName,
    status: "confirmed",
  });
  return { resultPath, rubricPath };
}

function initRepairSession({
  root,
  reviewMode = "bundle_zip",
  assignmentName = "Assignment A",
  resultPath,
  rubricPath,
  sourceZip = null,
  studentIndexPath = path.join(root, "tmp", "session", "fanya-current-student-index.json"),
  sessionPath = path.join(root, "tmp", "session", "fanya-current-task.json"),
  workDir = path.join(root, "tmp", "work-1", reviewMode === "bundle_zip" ? "bundle-Assignment A" : "web-Assignment A"),
  students = [],
  completedStudentKeys = [],
  skippedStudentKeys = [],
  currentStudentKey = null,
}) {
  const studentsDir = reviewMode === "bundle_zip" ? path.join(workDir, "students") : "";
  saveStudentIndex({
    indexPath: studentIndexPath,
    courseName: "Course A",
    assignmentName,
    reviewMode,
    source: reviewMode === "bundle_zip" ? "bundle_students_dir" : "web_roster",
    students,
  });
  initSession({
    sessionPath,
    courseName: "Course A",
    assignmentName,
    localWorkIndex: 1,
    reviewMode,
    status: "reviewing_students",
    rubricPath,
    resultPath,
    reviewSourcePath: workDir,
    studentIndexPath,
    sourceZip,
    studentsDir,
    currentStudentKey,
    completedStudentKeys,
    skippedStudentKeys,
  });
  return { sessionPath, studentIndexPath, workDir, studentsDir };
}

test("repairTask refuses to write without confirm", async () => {
  const root = makeRoot();
  await assert.rejects(
    () => repairTask({ sessionPath: path.join(root, "tmp", "session", "fanya-current-task.json"), confirm: false }),
    /--confirm is required/,
  );
});

test("repairTask does not repair a missing result file", async () => {
  const root = makeRoot();
  const { resultPath, rubricPath } = createRecords({ root });
  const sourceZip = makeBundleArchive({ root, folders: ["20230001-Alpha"] });
  const fixture = initRepairSession({
    root,
    resultPath,
    rubricPath,
    sourceZip,
    students: [{ studentName: "Alpha", studentKey: "20230001", statusAtImport: "pending" }],
    currentStudentKey: "20230001",
  });
  fs.rmSync(resultPath);
  fs.rmSync(fixture.workDir, { recursive: true, force: true });

  const result = await repairTask({ sessionPath: fixture.sessionPath, confirm: true });

  assert.equal(result.status, "blocked");
  assert.equal(result.issues.some((issue) => issue.code === "missing_result"), true);
  assert.equal(fs.existsSync(resultPath), false);
});

test("repairTask attaches a confirmed matching rubric", async () => {
  const root = makeRoot();
  const { resultPath, rubricPath } = createRecords({ root });
  const matchingRubricPath = createRubricRecordFile({
    rubricPath: path.join(root, "replacement-rubric.cjs"),
    courseName: "Course A",
    assignmentName: "Assignment A",
    status: "confirmed",
  });
  const fixture = initRepairSession({
    root,
    reviewMode: "web_download",
    resultPath,
    rubricPath,
    students: [{ studentName: "Alpha", studentKey: "20230001", statusAtImport: "pending", reviewUrl: "https://example.test/review" }],
    currentStudentKey: "20230001",
  });
  fs.rmSync(rubricPath);

  const result = await repairTask({ sessionPath: fixture.sessionPath, confirm: true, rubricPath: matchingRubricPath });

  assert.equal(result.status, "repaired_rubric");
  assert.equal(loadSession(fixture.sessionPath).rubricPath, matchingRubricPath);
});

test("repairTask rejects a mismatched rubric", async () => {
  const root = makeRoot();
  const { resultPath, rubricPath } = createRecords({ root });
  const mismatchedRubricPath = createRubricRecordFile({
    rubricPath: path.join(root, "wrong-rubric.cjs"),
    courseName: "Course B",
    assignmentName: "Assignment A",
    status: "confirmed",
  });
  const fixture = initRepairSession({
    root,
    reviewMode: "web_download",
    resultPath,
    rubricPath,
    students: [{ studentName: "Alpha", studentKey: "20230001", statusAtImport: "pending", reviewUrl: "https://example.test/review" }],
    currentStudentKey: "20230001",
  });
  fs.rmSync(rubricPath);

  const result = await repairTask({ sessionPath: fixture.sessionPath, confirm: true, rubricPath: mismatchedRubricPath });

  assert.equal(result.status, "needs_user_action");
  assert.equal(result.issues.some((issue) => issue.code === "rubric_context_mismatch"), true);
  assert.equal(loadSession(fixture.sessionPath).rubricPath, rubricPath);
});

test("repairTask regenerates a confirmed rubric from supplied content", async () => {
  const root = makeRoot();
  const { resultPath, rubricPath } = createRecords({ root });
  const regeneratedRubricPath = path.join(root, "regenerated-rubric.cjs");
  const fixture = initRepairSession({
    root,
    reviewMode: "web_download",
    resultPath,
    rubricPath,
    students: [{ studentName: "Alpha", studentKey: "20230001", statusAtImport: "pending", reviewUrl: "https://example.test/review" }],
    currentStudentKey: "20230001",
  });
  fs.rmSync(rubricPath);

  const result = await repairTask({
    sessionPath: fixture.sessionPath,
    confirm: true,
    regenerateRubric: true,
    rubricPath: regeneratedRubricPath,
    rubric: {
      assignmentSummary: "Assignment requirements summary",
      dimensions: [{ name: "Completeness", points: 40 }],
      scoreBands: [{ range: "80-89", meaning: "Good" }],
    },
    confirmRubric: true,
  });

  const rubric = loadRecord(regeneratedRubricPath);
  assert.equal(result.status, "repaired_rubric");
  assert.equal(rubric.courseName, "Course A");
  assert.equal(rubric.assignmentName, "Assignment A");
  assert.equal(rubric.status, "confirmed");
  assert.equal(loadSession(fixture.sessionPath).rubricPath, regeneratedRubricPath);
});

test("repairTask rebuilds missing bundle runtime state from the bundle zip", async () => {
  const root = makeRoot();
  const { resultPath, rubricPath } = createRecords({ root });
  const sourceZip = makeBundleArchive({ root, folders: ["20230001-Alpha", "20230002-Beta", "20230003-Gamma"] });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment A",
    review: { studentName: "Alpha", studentKey: "20230001", status: "reviewed", suggestedScore: 88 },
  });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment A",
    review: { studentName: "Beta", studentKey: "20230002", status: "skipped", statusReason: "user_skipped" },
  });
  const fixture = initRepairSession({
    root,
    resultPath,
    rubricPath,
    sourceZip,
    students: [
      { studentName: "Alpha", studentKey: "20230001", statusAtImport: "pending" },
      { studentName: "Beta", studentKey: "20230002", statusAtImport: "pending" },
      { studentName: "Gamma", studentKey: "20230003", statusAtImport: "pending" },
    ],
    completedStudentKeys: ["20230001"],
    skippedStudentKeys: ["20230002"],
    currentStudentKey: "20230003",
  });
  fs.rmSync(fixture.workDir, { recursive: true, force: true });

  const result = await repairTask({ sessionPath: fixture.sessionPath, confirm: true });

  const session = loadSession(fixture.sessionPath);
  assert.equal(result.status, "repaired_bundle");
  assert.equal(fs.existsSync(result.reviewSourcePath), true);
  assert.equal(fs.existsSync(result.studentsDir), true);
  assert.deepEqual(session.completedStudentKeys, ["20230001"]);
  assert.deepEqual(session.skippedStudentKeys, ["20230002"]);
  assert.equal(session.currentStudentKey, "20230003");
  assert.deepEqual(result.pendingEvidenceStudentKeys, ["20230003"]);
  assert.equal(result.staleArtifacts.includes("contact_sheet"), true);
});

test("repairTask preserves draftReviews without marking them completed during bundle repair", async () => {
  const root = makeRoot();
  const { resultPath, rubricPath } = createRecords({ root });
  const sourceZip = makeBundleArchive({ root, folders: ["20230001-Alpha", "20230002-Beta"] });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment A",
    review: { studentName: "Alpha", studentKey: "20230001", status: "reviewed", suggestedScore: 88 },
  });
  upsertDraftReviews({
    resultPath,
    assignmentName: "Assignment A",
    drafts: [{ studentName: "Beta", studentKey: "20230002", suggestedScore: 84, comment: "The visible work is mostly complete." }],
  });
  const fixture = initRepairSession({
    root,
    resultPath,
    rubricPath,
    sourceZip,
    students: [
      { studentName: "Alpha", studentKey: "20230001", statusAtImport: "pending" },
      { studentName: "Beta", studentKey: "20230002", statusAtImport: "pending" },
    ],
    completedStudentKeys: ["20230001"],
    currentStudentKey: "20230002",
  });
  fs.rmSync(fixture.workDir, { recursive: true, force: true });

  const result = await repairTask({ sessionPath: fixture.sessionPath, confirm: true });
  const session = loadSession(fixture.sessionPath);

  assert.equal(result.status, "repaired_bundle");
  assert.equal(assignmentDraftReviews(resultPath, "Assignment A")[0].studentKey, "20230002");
  assert.deepEqual(session.completedStudentKeys, ["20230001"]);
  assert.equal(session.currentStudentKey, "20230002");
});

test("repairTask allows added stable bundle keys while preserving handled keys", async () => {
  const root = makeRoot();
  const { resultPath, rubricPath } = createRecords({ root });
  const sourceZip = makeBundleArchive({ root, folders: ["20230001-Alpha", "20230002-Beta"] });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment A",
    review: { studentName: "Alpha", studentKey: "20230001", status: "reviewed", suggestedScore: 88 },
  });
  const fixture = initRepairSession({
    root,
    resultPath,
    rubricPath,
    sourceZip,
    students: [{ studentName: "Alpha", studentKey: "20230001", statusAtImport: "pending" }],
    completedStudentKeys: ["20230001"],
  });
  fs.rmSync(fixture.workDir, { recursive: true, force: true });

  const result = await repairTask({ sessionPath: fixture.sessionPath, confirm: true });

  assert.equal(result.status, "repaired_bundle");
  assert.deepEqual(result.comparison.addedKeys, ["20230002"]);
});

test("repairTask requires a local key map when bundle local keys change", async () => {
  const root = makeRoot();
  const { resultPath, rubricPath } = createRecords({ root });
  const sourceZip = makeBundleArchive({ root, folders: ["0 New Student", "Alpha"] });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment A",
    review: { studentName: "Alpha", studentKey: "local-001", status: "reviewed", suggestedScore: 88 },
  });
  const fixture = initRepairSession({
    root,
    resultPath,
    rubricPath,
    sourceZip,
    students: [{ studentName: "Alpha", studentKey: "local-001", statusAtImport: "pending" }],
    completedStudentKeys: ["local-001"],
  });
  fs.rmSync(fixture.workDir, { recursive: true, force: true });

  const result = await repairTask({ sessionPath: fixture.sessionPath, confirm: true });

  assert.equal(result.status, "needs_user_action");
  assert.equal(result.issues.some((issue) => issue.code === "local_key_mapping_required"), true);
  assert.equal(fs.existsSync(fixture.workDir), false);
});

test("repairTask applies confirmed local key mapping and renames bundle folders", async () => {
  const root = makeRoot();
  const { resultPath, rubricPath } = createRecords({ root });
  const sourceZip = makeBundleArchive({ root, folders: ["0 New Student", "Alpha"] });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment A",
    review: { studentName: "Alpha", studentKey: "local-001", status: "reviewed", suggestedScore: 88 },
  });
  const fixture = initRepairSession({
    root,
    resultPath,
    rubricPath,
    sourceZip,
    students: [{ studentName: "Alpha", studentKey: "local-001", statusAtImport: "pending" }],
    completedStudentKeys: ["local-001"],
  });
  const mapPath = path.join(root, "tmp", "session", "local-key-map.json");
  fs.mkdirSync(path.dirname(mapPath), { recursive: true });
  fs.writeFileSync(mapPath, JSON.stringify({
    schemaVersion: 1,
    mappings: [{ oldStudentKey: "local-001", newStudentKey: "local-002" }],
  }, null, 2));
  fs.rmSync(fixture.workDir, { recursive: true, force: true });

  const result = await repairTask({ sessionPath: fixture.sessionPath, confirm: true, localKeyMapPath: mapPath });

  const index = loadStudentIndex(fixture.studentIndexPath);
  assert.equal(result.status, "repaired_bundle");
  assert.equal(index.students.some((student) => student.studentKey === "local-001" && student.studentName === "Alpha"), true);
  assert.equal(fs.existsSync(path.join(result.studentsDir, "local-001-Alpha")), true);
  assert.equal(index.students.filter((student) => student.studentKey === "local-001").length, 1);
});

test("repairTask keeps draftReviews aligned when confirmed local key mapping is applied", async () => {
  const root = makeRoot();
  const { resultPath, rubricPath } = createRecords({ root });
  const sourceZip = makeBundleArchive({ root, folders: ["0 New Student", "Alpha"] });
  upsertDraftReviews({
    resultPath,
    assignmentName: "Assignment A",
    drafts: [{ studentName: "Alpha", studentKey: "local-001", suggestedScore: 84, comment: "The visible work is mostly complete." }],
  });
  const fixture = initRepairSession({
    root,
    resultPath,
    rubricPath,
    sourceZip,
    students: [{ studentName: "Alpha", studentKey: "local-001", statusAtImport: "pending" }],
    currentStudentKey: "local-001",
  });
  const mapPath = path.join(root, "tmp", "session", "local-key-map.json");
  fs.mkdirSync(path.dirname(mapPath), { recursive: true });
  fs.writeFileSync(mapPath, JSON.stringify({
    schemaVersion: 1,
    mappings: [{ oldStudentKey: "local-001", newStudentKey: "local-002" }],
  }, null, 2));
  fs.rmSync(fixture.workDir, { recursive: true, force: true });

  const result = await repairTask({ sessionPath: fixture.sessionPath, confirm: true, localKeyMapPath: mapPath });
  const index = loadStudentIndex(fixture.studentIndexPath);

  assert.equal(result.status, "repaired_bundle");
  assert.equal(index.students.some((student) => student.studentKey === "local-001"), true);
  assert.equal(assignmentDraftReviews(resultPath, "Assignment A")[0].studentKey, "local-001");
  assert.deepEqual(loadSession(fixture.sessionPath).completedStudentKeys, []);
});

test("repairTask warns but does not block when a draft key is missing from rebuilt bundle index", async () => {
  const root = makeRoot();
  const { resultPath, rubricPath } = createRecords({ root });
  const sourceZip = makeBundleArchive({ root, folders: ["20230001-Alpha"] });
  upsertDraftReviews({
    resultPath,
    assignmentName: "Assignment A",
    drafts: [{ studentName: "Missing", studentKey: "local-999", suggestedScore: 82, comment: "The visible work is mostly complete." }],
  });
  const fixture = initRepairSession({
    root,
    resultPath,
    rubricPath,
    sourceZip,
    students: [{ studentName: "Alpha", studentKey: "20230001", statusAtImport: "pending" }],
    currentStudentKey: "20230001",
  });
  fs.rmSync(fixture.workDir, { recursive: true, force: true });

  const result = await repairTask({ sessionPath: fixture.sessionPath, confirm: true });

  assert.equal(result.status, "repaired_bundle");
  assert.equal(result.warnings.some((warning) => warning.code === "missing_draft_keys"), true);
  assert.deepEqual(loadSession(fixture.sessionPath).completedStudentKeys, []);
});

test("repairTask asks for the original bundle zip when extracted bundle files are missing", async () => {
  const root = makeRoot();
  const { resultPath, rubricPath } = createRecords({ root });
  const sourceZip = makeBundleArchive({ root, folders: ["20230001-Alpha"] });
  const fixture = initRepairSession({
    root,
    resultPath,
    rubricPath,
    sourceZip,
    students: [{ studentName: "Alpha", studentKey: "20230001", statusAtImport: "pending" }],
    currentStudentKey: "20230001",
  });
  fs.rmSync(fixture.workDir, { recursive: true, force: true });
  fs.rmSync(sourceZip);
  const beforeResult = fs.readFileSync(resultPath, "utf8");
  const beforeSession = fs.readFileSync(fixture.sessionPath, "utf8");

  const result = await repairTask({ sessionPath: fixture.sessionPath, confirm: true });

  assert.equal(result.status, "needs_user_action");
  assert.equal(result.issues.some((issue) => issue.code === "missing_bundle_zip"), true);
  assert.equal(fs.readFileSync(resultPath, "utf8"), beforeResult);
  assert.equal(fs.readFileSync(fixture.sessionPath, "utf8"), beforeSession);
});

test("repairTask blocks invalid local key mapping files", async () => {
  const root = makeRoot();
  const { resultPath, rubricPath } = createRecords({ root });
  const sourceZip = makeBundleArchive({ root, folders: ["0 New Student", "Alpha"] });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment A",
    review: { studentName: "Alpha", studentKey: "local-001", status: "reviewed", suggestedScore: 88 },
  });
  const fixture = initRepairSession({
    root,
    resultPath,
    rubricPath,
    sourceZip,
    students: [{ studentName: "Alpha", studentKey: "local-001", statusAtImport: "pending" }],
    completedStudentKeys: ["local-001"],
  });
  const mapPath = path.join(root, "tmp", "session", "local-key-map.json");
  fs.mkdirSync(path.dirname(mapPath), { recursive: true });
  fs.writeFileSync(mapPath, JSON.stringify({
    schemaVersion: 1,
    mappings: [
      { oldStudentKey: "local-001", newStudentKey: "local-002" },
      { oldStudentKey: "local-001", newStudentKey: "local-003" },
    ],
  }, null, 2));
  fs.rmSync(fixture.workDir, { recursive: true, force: true });

  const result = await repairTask({ sessionPath: fixture.sessionPath, confirm: true, localKeyMapPath: mapPath });

  assert.equal(result.status, "blocked");
  assert.equal(result.issues.some((issue) => issue.code === "invalid_local_key_map"), true);
  assert.equal(fs.existsSync(fixture.workDir), false);
});

test("repairTask stops web repair without a browser session or injected capture", async () => {
  const root = makeRoot();
  const { resultPath, rubricPath } = createRecords({ root });
  const fixture = initRepairSession({
    root,
    reviewMode: "web_download",
    resultPath,
    rubricPath,
    students: [{ studentName: "Alpha", studentKey: "20230001", statusAtImport: "pending", reviewUrl: "https://example.test/review" }],
    currentStudentKey: "20230001",
  });
  fs.rmSync(fixture.studentIndexPath);

  const result = await repairTask({ sessionPath: fixture.sessionPath, confirm: true });

  assert.equal(result.status, "needs_user_action");
  assert.equal(result.issues.some((issue) => issue.code === "missing_browser_session"), true);
});

test("repairTask rebuilds missing web student index from captured roster", async () => {
  const root = makeRoot();
  const { resultPath, rubricPath } = createRecords({ root });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment A",
    review: { studentName: "Alpha", studentKey: "20230001", status: "reviewed", suggestedScore: 88 },
  });
  const fixture = initRepairSession({
    root,
    reviewMode: "web_download",
    resultPath,
    rubricPath,
    students: [{ studentName: "Alpha", studentKey: "20230001", statusAtImport: "pending", reviewUrl: "https://example.test/review" }],
    completedStudentKeys: ["20230001"],
  });
  fs.rmSync(fixture.studentIndexPath);

  const result = await repairTask({
    sessionPath: fixture.sessionPath,
    confirm: true,
    captureRoster: async () => ({
      rows: [
        { text: "20230001 Alpha Completed", cells: ["20230001", "Alpha", "Completed"], links: [{ text: "Review", href: "https://example.test/review/1" }] },
        { text: "20230002 Beta To be reviewed", cells: ["20230002", "Beta", "To be reviewed"], links: [{ text: "Review", href: "https://example.test/review/2" }] },
      ],
      pageCount: 1,
    }),
  });

  assert.equal(result.status, "repaired_web_index");
  assert.equal(loadStudentIndex(fixture.studentIndexPath).reviewMode, "web_download");
  assert.deepEqual(loadSession(fixture.sessionPath).completedStudentKeys, ["20230001"]);
  assert.deepEqual(result.comparison.addedKeys, ["20230002"]);
});

test("repairTask blocks web repair when result keys are missing from rebuilt roster", async () => {
  const root = makeRoot();
  const { resultPath, rubricPath } = createRecords({ root });
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment A",
    review: { studentName: "Alpha", studentKey: "20230001", status: "reviewed", suggestedScore: 88 },
  });
  const fixture = initRepairSession({
    root,
    reviewMode: "web_download",
    resultPath,
    rubricPath,
    students: [{ studentName: "Alpha", studentKey: "20230001", statusAtImport: "pending", reviewUrl: "https://example.test/review" }],
    completedStudentKeys: ["20230001"],
  });
  fs.rmSync(fixture.studentIndexPath);

  const result = await repairTask({
    sessionPath: fixture.sessionPath,
    confirm: true,
    captureRoster: async () => ({
      rows: [
        { text: "20230002 Beta To be reviewed", cells: ["20230002", "Beta", "To be reviewed"], links: [] },
      ],
      pageCount: 1,
    }),
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.issues.some((issue) => issue.code === "missing_repaired_keys"), true);
  assert.equal(fs.existsSync(fixture.studentIndexPath), false);
});
