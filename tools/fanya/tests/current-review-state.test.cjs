const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { buildReviewLoadPlan, currentReviewState } = require("../scripts/current-review-state.cjs");
const { appendStudentReview, createResultRecordFile, createRubricRecordFile } = require("../scripts/record-store.cjs");
const { initSession } = require("../scripts/task-session.cjs");

test("currentReviewState returns one student evidence navigation view", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-current-state-"));
  const sessionDir = path.join(root, "tmp", "session");
  const studentsDir = path.join(root, "tmp", "work-1", "bundle-Assignment", "students");
  const studentDir = path.join(studentsDir, "20230002-StudentB");
  const evidenceDir = path.join(studentDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "frame_01.png"), "frame");
  fs.writeFileSync(path.join(studentDir, "poster.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "review-assets.json"), JSON.stringify({
    evidenceComplete: true,
    generatedAt: "2026-06-23T00:00:00.000Z",
    externalViewable: ["../poster.png"],
  }));

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
  appendStudentReview({
    resultPath,
    assignmentName: "Assignment",
    review: { studentName: "Student A", studentKey: "20230001", status: "reviewed", suggestedScore: 86 },
  });

  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    rubricPath: "rubrics/Course/Assignment-rubric.cjs",
    resultPath,
    reviewSourcePath: path.join(root, "tmp", "work-1", "bundle-Assignment"),
    studentIndexPath,
    studentsDir,
    completedStudentKeys: ["20230001"],
  });

  const state = currentReviewState({ sessionPath });

  assert.equal(state.currentStudentKey, "20230002");
  assert.equal(state.student.studentName, "Student B");
  assert.equal(state.studentDir, studentDir);
  assert.equal(state.reviewAssets.evidenceComplete, true);
  assert.equal(state.mustReadLog, false);
  assert.deepEqual(state.externalViewable, [path.join(studentDir, "poster.png")]);
  assert.deepEqual(state.generatedEvidence, [path.join(evidenceDir, "frame_01.png")]);
  assert.equal(state.reviewLoadPlan.mode, "minimal_first_pass");
  assert.equal(state.reviewLoadPlan.maxInitialFiles, 4);
  assert.deepEqual(state.reviewLoadPlan.primaryFiles, [
    path.join(studentDir, "poster.png"),
    path.join(evidenceDir, "frame_01.png"),
  ]);
  assert.equal(state.reviewLoadPlan.mustReadLogInitially, false);
  assert.equal(state.alreadyReviewedInResult, false);
});

test("currentReviewState prioritizes a small first-pass evidence set", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-current-state-"));
  const sessionDir = path.join(root, "tmp", "session");
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "20230001-StudentA");
  const evidenceDir = path.join(studentDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "final-render.jpg"), "image");
  fs.writeFileSync(path.join(evidenceDir, "archive_texture_01.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "poster_01.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "report_text.txt"), "summary");
  fs.writeFileSync(path.join(evidenceDir, "slide_01.png"), "slide");
  fs.writeFileSync(path.join(evidenceDir, "source_model_01.png"), "model");
  fs.writeFileSync(path.join(evidenceDir, "review-assets.json"), JSON.stringify({
    evidenceComplete: true,
    generatedAt: "2026-06-23T00:00:00.000Z",
    externalViewable: ["../final-render.jpg"],
  }));

  const studentIndexPath = path.join(sessionDir, "fanya-current-student-index.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(studentIndexPath, JSON.stringify({
    schemaVersion: 1,
    courseName: "Course",
    assignmentName: "Assignment",
    reviewMode: "bundle_zip",
    source: "bundle_students_dir",
    students: [{ studentName: "Student A", studentKey: "20230001", statusAtImport: "pending" }],
  }));
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    resultPath,
    reviewSourcePath: root,
    studentIndexPath,
    studentsDir,
  });

  const state = currentReviewState({ sessionPath });

  assert.deepEqual(state.reviewLoadPlan.primaryFiles, [
    path.join(studentDir, "final-render.jpg"),
    path.join(evidenceDir, "poster_01.png"),
    path.join(evidenceDir, "report_text.txt"),
    path.join(evidenceDir, "slide_01.png"),
  ]);
  assert.equal(state.reviewLoadPlan.primaryFiles.includes(path.join(evidenceDir, "source_model_01.png")), false);
  assert.equal(state.reviewLoadPlan.fallbackFiles.includes(path.join(evidenceDir, "source_model_01.png")), true);
  assert.match(state.reviewLoadPlan.stopRule, /fair score band/);
});

test("buildReviewLoadPlan uses rubric representativeMediaTerms to rank primaryFiles", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-load-plan-representative-"));
  const renderPath = path.join(root, "aaa-render.png");
  const conceptPath = path.join(root, "zzz-concept.png");

  const plan = buildReviewLoadPlan({
    externalViewable: [renderPath, conceptPath],
    rubricPriority: {
      representativeMediaTerms: ["concept"],
    },
  });

  assert.equal(plan.primaryFiles[0], conceptPath);
});

test("buildReviewLoadPlan lets rubric primaryEvidence lift source archives", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-load-plan-primary-evidence-"));
  const sourceArchive = path.join(root, "source_archive.zip");

  const plan = buildReviewLoadPlan({
    generatedEvidence: [
      path.join(root, "render.png"),
      path.join(root, "report_text.txt"),
      path.join(root, "slide_01.png"),
      path.join(root, "neutral.dat"),
      sourceArchive,
    ],
    rubricPriority: {
      primaryEvidence: ["source archive"],
    },
  });

  assert.equal(plan.primaryFiles.includes(sourceArchive), true);
  assert.equal(plan.fallbackFiles.includes(sourceArchive), false);
});

test("buildReviewLoadPlan keeps source archives low priority without rubric override", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-load-plan-source-fallback-"));
  const sourceArchive = path.join(root, "source_archive.zip");

  const plan = buildReviewLoadPlan({
    generatedEvidence: [
      path.join(root, "render.png"),
      path.join(root, "report_text.txt"),
      path.join(root, "slide_01.png"),
      path.join(root, "neutral.dat"),
      sourceArchive,
    ],
    rubricPriority: {
      representativeMediaTerms: [],
      primaryEvidence: [],
    },
  });

  assert.equal(plan.primaryFiles.includes(sourceArchive), false);
  assert.equal(plan.fallbackFiles.includes(sourceArchive), true);
});

test("currentReviewState includes rubric review priority when available", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-current-state-"));
  const sessionDir = path.join(root, "tmp", "session");
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "20230001-StudentA");
  const evidenceDir = path.join(studentDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "poster_01.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "review-assets.json"), JSON.stringify({
    evidenceComplete: true,
    generatedAt: "2026-06-23T00:00:00.000Z",
    externalViewable: [],
  }));

  const studentIndexPath = path.join(sessionDir, "fanya-current-student-index.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(studentIndexPath, JSON.stringify({
    schemaVersion: 1,
    courseName: "Course",
    assignmentName: "Assignment",
    reviewMode: "bundle_zip",
    source: "bundle_students_dir",
    students: [{ studentName: "Student A", studentKey: "20230001", statusAtImport: "pending" }],
  }));
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });
  const rubricPath = createRubricRecordFile({
    rubricPath: path.join(root, "rubric.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
    reviewPriority: [
      "Inspect final render or poster images first.",
      "Open report text only if the visuals do not justify a score band.",
    ],
    status: "confirmed",
  });
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    rubricPath,
    resultPath,
    reviewSourcePath: root,
    studentIndexPath,
    studentsDir,
  });

  const state = currentReviewState({ sessionPath });

  assert.deepEqual(state.reviewLoadPlan.rubricPriority, [
    "Inspect final render or poster images first.",
    "Open report text only if the visuals do not justify a score band.",
  ]);
});

test("currentReviewState supports object rubric review priority", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-current-state-priority-object-"));
  const sessionDir = path.join(root, "tmp", "session");
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "20230001-StudentA");
  const evidenceDir = path.join(studentDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "review-assets.json"), JSON.stringify({
    evidenceComplete: true,
    generatedAt: "2026-06-30T00:00:00.000Z",
    externalViewable: [],
  }));
  const studentIndexPath = path.join(sessionDir, "fanya-current-student-index.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(studentIndexPath, JSON.stringify({
    schemaVersion: 1,
    courseName: "Course",
    assignmentName: "Assignment",
    reviewMode: "bundle_zip",
    source: "bundle_students_dir",
    students: [{ studentName: "Student A", studentKey: "20230001", statusAtImport: "pending" }],
  }));
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });
  const rubricPath = createRubricRecordFile({
    rubricPath: path.join(root, "rubric.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
    reviewPriority: {
      recommendedMode: "fast_bundle",
      primaryEvidence: ["Read review-text.md first."],
      commentRule: "Write personalized comments by default.",
    },
    status: "confirmed",
  });
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    rubricPath,
    resultPath,
    reviewSourcePath: root,
    studentIndexPath,
    studentsDir,
  });

  const state = currentReviewState({ sessionPath });

  assert.equal(state.reviewLoadPlan.rubricPriority.recommendedMode, "fast_bundle");
  assert.equal(state.reviewLoadPlan.rubricPriority.commentRule, "Write personalized comments by default.");
});

test("currentReviewState prioritizes review-text bundles in the first pass", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-current-state-review-text-"));
  const sessionDir = path.join(root, "tmp", "session");
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "20230001-StudentA");
  const evidenceDir = path.join(studentDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "poster_01.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "review-text.md"), "summary");
  fs.writeFileSync(path.join(evidenceDir, "review-assets.json"), JSON.stringify({
    evidenceComplete: true,
    generatedAt: "2026-06-30T00:00:00.000Z",
    externalViewable: [],
    reviewText: "review-text.md",
    textBundleComplete: true,
  }));
  const studentIndexPath = path.join(sessionDir, "fanya-current-student-index.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(studentIndexPath, JSON.stringify({
    schemaVersion: 1,
    courseName: "Course",
    assignmentName: "Assignment",
    reviewMode: "bundle_zip",
    source: "bundle_students_dir",
    students: [{ studentName: "Student A", studentKey: "20230001", statusAtImport: "pending" }],
  }));
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    resultPath,
    reviewSourcePath: root,
    studentIndexPath,
    studentsDir,
  });

  const state = currentReviewState({ sessionPath });

  assert.equal(state.reviewLoadPlan.primaryFiles[0], path.join(evidenceDir, "review-text.md"));
});

test("currentReviewState prioritizes Chinese visual evidence names", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-current-state-cn-evidence-"));
  const sessionDir = path.join(root, "tmp", "session");
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "20230001-StudentA");
  const evidenceDir = path.join(studentDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "aaa-source.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "zzz-海报.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "review-assets.json"), JSON.stringify({
    evidenceComplete: true,
    generatedAt: "2026-06-30T00:00:00.000Z",
    externalViewable: [],
  }));
  const studentIndexPath = path.join(sessionDir, "fanya-current-student-index.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(studentIndexPath, JSON.stringify({
    schemaVersion: 1,
    courseName: "Course",
    assignmentName: "Assignment",
    reviewMode: "bundle_zip",
    source: "bundle_students_dir",
    students: [{ studentName: "Student A", studentKey: "20230001", statusAtImport: "pending" }],
  }));
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    resultPath,
    reviewSourcePath: root,
    studentIndexPath,
    studentsDir,
  });

  const state = currentReviewState({ sessionPath });

  assert.equal(state.reviewLoadPlan.primaryFiles[0], path.join(evidenceDir, "zzz-海报.png"));
});

test("currentReviewState points to prepare log only for incomplete evidence", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-current-state-"));
  const sessionDir = path.join(root, "tmp", "session");
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "20230001-StudentA");
  const evidenceDir = path.join(studentDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "review-assets.json"), JSON.stringify({
    evidenceComplete: false,
    generatedAt: "2026-06-23T00:00:00.000Z",
    externalViewable: [],
  }));
  fs.writeFileSync(path.join(evidenceDir, "prepare-evidence-log.json"), JSON.stringify({
    evidenceComplete: false,
    manualReview: [{ filename: "broken.mov", reason: "ffmpeg not found" }],
  }));

  const studentIndexPath = path.join(sessionDir, "fanya-current-student-index.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(studentIndexPath, JSON.stringify({
    schemaVersion: 1,
    courseName: "Course",
    assignmentName: "Assignment",
    reviewMode: "bundle_zip",
    source: "bundle_students_dir",
    students: [{ studentName: "Student A", studentKey: "20230001", statusAtImport: "pending" }],
  }));
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    resultPath,
    reviewSourcePath: root,
    studentIndexPath,
    studentsDir,
  });

  const state = currentReviewState({ sessionPath });

  assert.equal(state.mustReadLog, true);
  assert.equal(state.prepareEvidenceLogPath, path.join(evidenceDir, "prepare-evidence-log.json"));
});

test("currentReviewState exposes web review navigation without bundle studentsDir", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-current-state-web-"));
  const sessionDir = path.join(root, "tmp", "session");
  const studentIndexPath = path.join(sessionDir, "fanya-current-student-index.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(studentIndexPath, JSON.stringify({
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
        reviewUrl: "https://example.test/review?studentId=20230001",
      },
    ],
  }));
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 7,
    reviewMode: "web_download",
    resultPath,
    reviewSourcePath: path.join(root, "tmp", "work-7"),
    studentIndexPath,
    studentsDir: "",
  });

  const state = currentReviewState({ sessionPath });

  assert.equal(state.reviewMode, "web_download");
  assert.equal(state.currentStudentKey, "20230001");
  assert.equal(state.webReviewUrl, "https://example.test/review?studentId=20230001");
  assert.equal(state.needsBrowserReviewPage, true);
  assert.equal(state.needsAttachmentDownload, true);
  assert.equal(state.studentDir, "tmp/work-7/student-1");
});

test("currentReviewState keeps bundle mode free of web review URLs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-current-state-bundle-"));
  const sessionDir = path.join(root, "tmp", "session");
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "20230001-StudentA");
  fs.mkdirSync(studentDir, { recursive: true });
  const studentIndexPath = path.join(sessionDir, "fanya-current-student-index.json");
  fs.mkdirSync(sessionDir, { recursive: true });
  fs.writeFileSync(studentIndexPath, JSON.stringify({
    schemaVersion: 1,
    courseName: "Course",
    assignmentName: "Assignment",
    reviewMode: "bundle_zip",
    source: "bundle_students_dir",
    students: [{ studentName: "Student A", studentKey: "20230001", statusAtImport: "pending" }],
  }));
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
  });
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    resultPath,
    reviewSourcePath: root,
    studentIndexPath,
    studentsDir,
  });

  const state = currentReviewState({ sessionPath });

  assert.equal(state.reviewMode, "bundle_zip");
  assert.equal(state.webReviewUrl, null);
  assert.equal(state.needsBrowserReviewPage, false);
  assert.equal(state.needsAttachmentDownload, false);
  assert.equal(state.studentDir, studentDir);
});
