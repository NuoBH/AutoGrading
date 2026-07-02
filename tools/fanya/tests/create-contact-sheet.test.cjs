const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createRubricRecordFile } = require("../scripts/record-store.cjs");
const { initSession } = require("../scripts/task-session.cjs");

const SCRIPT = path.join(__dirname, "..", "scripts", "create-contact-sheet.cjs");

function pythonHasPillow() {
  try {
    execFileSync(process.env.PYTHON || "python", ["-c", "import PIL"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

test("selectRepresentativeImage follows preferred filename terms", () => {
  const { selectRepresentativeImage } = require("../scripts/create-contact-sheet.cjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-contact-select-"));
  const studentDir = path.join(root, "20230001-StudentA");
  fs.mkdirSync(studentDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "normal.png"), "image");
  fs.writeFileSync(path.join(studentDir, "final-poster.jpg"), "image");

  const selected = selectRepresentativeImage(studentDir, ["poster", "normal"]);

  assert.equal(path.basename(selected), "final-poster.jpg");
});

test("selectRepresentativeImage defaults to Chinese visual deliverable terms", () => {
  const { selectRepresentativeImage } = require("../scripts/create-contact-sheet.cjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-contact-select-cn-"));
  const studentDir = path.join(root, "20230001-StudentA");
  fs.mkdirSync(studentDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "普通图片.png"), "image");
  fs.writeFileSync(path.join(studentDir, "成果排版图.jpg"), "image");

  const selected = selectRepresentativeImage(studentDir);

  assert.equal(path.basename(selected), "成果排版图.jpg");
});

test("default representative media terms stay in the contact sheet script", () => {
  const { DEFAULT_REPRESENTATIVE_MEDIA_TERMS } = require("../scripts/create-contact-sheet.cjs");

  for (const term of ["成果排版", "视频帧", "渲染图", "poster", "screenshot", "frame"]) {
    assert.equal(DEFAULT_REPRESENTATIVE_MEDIA_TERMS.includes(term), true);
  }
});

test("create-contact-sheet writes an svg contact sheet and json mapping", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-contact-sheet-"));
  const studentsDir = path.join(root, "students");
  fs.mkdirSync(path.join(studentsDir, "20230001-StudentA"), { recursive: true });
  fs.mkdirSync(path.join(studentsDir, "20230002-StudentB"), { recursive: true });
  fs.writeFileSync(path.join(studentsDir, "20230001-StudentA", "poster.png"), "image");
  fs.writeFileSync(path.join(studentsDir, "20230002-StudentB", "work.jpg"), "image");
  const out = path.join(root, "contact-sheet.svg");
  const map = path.join(root, "contact-sheet.json");

  const stdout = execFileSync(process.execPath, [
    SCRIPT,
    "--students-dir",
    studentsDir,
    "--out",
    out,
    "--map-out",
    map,
    "--prefer",
    "poster,work",
  ], { encoding: "utf8" });
  const printed = JSON.parse(stdout);
  const mapping = JSON.parse(fs.readFileSync(map, "utf8"));

  assert.equal(printed.status, "created_contact_sheet");
  assert.equal(fs.existsSync(out), true);
  assert.equal(mapping.students.length, 2);
  assert.equal(mapping.students[0].studentKey, "20230001");
  assert.equal(path.basename(mapping.students[0].sourceImage), "poster.png");
});

test("create-contact-sheet can derive preferred terms from a rubric", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-contact-rubric-"));
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "20230001-StudentA");
  fs.mkdirSync(studentDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "aaa-normal.png"), "image");
  fs.writeFileSync(path.join(studentDir, "zzz-hero-shot.png"), "image");
  const rubricPath = path.join(root, "rubric.cjs");
  fs.writeFileSync(rubricPath, `module.exports = ${JSON.stringify({
    schemaVersion: 1,
    kind: "fanya_rubric",
    courseName: "Course",
    assignmentName: "Assignment",
    status: "confirmed",
    reviewPriority: {
      recommendedMode: "fast_bundle",
      representativeMediaTerms: ["hero"],
    },
  }, null, 2)};\n`, "utf8");
  const out = path.join(root, "contact-sheet.svg");
  const map = path.join(root, "contact-sheet.json");

  execFileSync(process.execPath, [
    SCRIPT,
    "--students-dir",
    studentsDir,
    "--out",
    out,
    "--map-out",
    map,
    "--rubric-path",
    rubricPath,
  ], { encoding: "utf8" });
  const mapping = JSON.parse(fs.readFileSync(map, "utf8"));

  assert.equal(path.basename(mapping.students[0].sourceImage), "zzz-hero-shot.png");
});

test("create-contact-sheet selects representative image from review primaryFiles before directory scan", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-contact-primary-files-"));
  const sessionDir = path.join(root, "tmp", "session");
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "20230001-StudentA");
  const evidenceDir = path.join(studentDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "aaa-random.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "poster_01.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "render.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "report_text.txt"), "summary");
  fs.writeFileSync(path.join(evidenceDir, "slide_01.png"), "slide");
  fs.writeFileSync(path.join(evidenceDir, "review-assets.json"), JSON.stringify({
    evidenceComplete: true,
    externalViewable: ["../aaa-random.png"],
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
  const rubricPath = createRubricRecordFile({
    rubricPath: path.join(root, "rubric.cjs"),
    courseName: "Course",
    assignmentName: "Assignment",
    reviewPriority: {
      recommendedMode: "fast_bundle",
      representativeMediaTerms: ["poster"],
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
    resultPath: path.join(root, "result.cjs"),
    reviewSourcePath: root,
    studentIndexPath,
    studentsDir,
  });
  const out = path.join(root, "contact-sheet.svg");
  const map = path.join(root, "contact-sheet.json");

  execFileSync(process.execPath, [
    SCRIPT,
    "--students-dir",
    studentsDir,
    "--session-path",
    sessionPath,
    "--out",
    out,
    "--map-out",
    map,
    "--rubric-path",
    rubricPath,
    "--prefer",
    "random,poster",
  ], { encoding: "utf8" });
  const mapping = JSON.parse(fs.readFileSync(map, "utf8"));

  assert.equal(path.basename(mapping.students[0].sourceImage), "poster_01.png");
});

test("create-contact-sheet preserves primaryFiles image order unless prefer is explicit", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-contact-primary-order-"));
  const sessionDir = path.join(root, "tmp", "session");
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "20230001-StudentA");
  const evidenceDir = path.join(studentDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "alpha-render.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "zzz-poster.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "review-assets.json"), JSON.stringify({
    evidenceComplete: true,
    externalViewable: ["alpha-render.png", "zzz-poster.png"],
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
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    resultPath: path.join(root, "result.cjs"),
    reviewSourcePath: root,
    studentIndexPath,
    studentsDir,
  });
  const out = path.join(root, "contact-sheet.svg");
  const map = path.join(root, "contact-sheet.json");

  execFileSync(process.execPath, [
    SCRIPT,
    "--students-dir",
    studentsDir,
    "--session-path",
    sessionPath,
    "--out",
    out,
    "--map-out",
    map,
  ], { encoding: "utf8" });
  const mapping = JSON.parse(fs.readFileSync(map, "utf8"));

  assert.equal(path.basename(mapping.students[0].sourceImage), "alpha-render.png");
});

test("create-contact-sheet falls back to directory images when primaryFiles has no image", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-contact-primary-fallback-"));
  const sessionDir = path.join(root, "tmp", "session");
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "20230001-StudentA");
  const evidenceDir = path.join(studentDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "final-render.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "review-text.md"), "summary");
  fs.writeFileSync(path.join(evidenceDir, "review-assets.json"), JSON.stringify({
    evidenceComplete: true,
    externalViewable: [],
    reviewText: "review-text.md",
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
  const sessionPath = path.join(sessionDir, "fanya-current-task.json");
  initSession({
    sessionPath,
    courseName: "Course",
    assignmentName: "Assignment",
    localWorkIndex: 1,
    reviewMode: "bundle_zip",
    resultPath: path.join(root, "result.cjs"),
    reviewSourcePath: root,
    studentIndexPath,
    studentsDir,
  });
  const out = path.join(root, "contact-sheet.svg");
  const map = path.join(root, "contact-sheet.json");

  execFileSync(process.execPath, [
    SCRIPT,
    "--students-dir",
    studentsDir,
    "--session-path",
    sessionPath,
    "--out",
    out,
    "--map-out",
    map,
  ], { encoding: "utf8" });
  const mapping = JSON.parse(fs.readFileSync(map, "utf8"));

  assert.equal(path.basename(mapping.students[0].sourceImage), "final-render.png");
});

test("create-contact-sheet flags fallback document cover selections in notes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-contact-cover-notes-"));
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "20230001-StudentA");
  fs.mkdirSync(studentDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "report-cover.png"), "image");
  const out = path.join(root, "contact-sheet.svg");
  const map = path.join(root, "contact-sheet.json");
  const notes = path.join(root, "contact-sheet-review-notes.json");

  execFileSync(process.execPath, [
    SCRIPT,
    "--students-dir",
    studentsDir,
    "--out",
    out,
    "--map-out",
    map,
    "--notes-out",
    notes,
  ], { encoding: "utf8" });
  const mapping = JSON.parse(fs.readFileSync(map, "utf8"));
  const reviewNotes = JSON.parse(fs.readFileSync(notes, "utf8"));

  assert.deepEqual(mapping.students[0].selectionIssues, ["document_cover_selected", "needs_representative_image_review"]);
  assert.equal(reviewNotes.notes[0].studentKey, "20230001");
  assert.equal(reviewNotes.notes[0].issueCode, "document_cover_selected");
});

test("create-contact-sheet supports video-first multi-slot selections", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-contact-video-slots-"));
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "local-001-StudentA");
  const evidenceDir = path.join(studentDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "video-final_01.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "video-reel_01.png"), "image");
  fs.writeFileSync(path.join(studentDir, "planning.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "review-assets.json"), JSON.stringify({
    schemaVersion: 2,
    evidenceComplete: true,
    evidenceItems: [
      {
        path: "video-final_01.png",
        absolutePath: path.join(evidenceDir, "video-final_01.png"),
        kind: "video_frame",
        sourceKind: "video",
        sourceFile: path.join(studentDir, "final.mp4"),
        sourceBasename: "final.mp4",
        generated: true,
        frameIndex: 1,
      },
      {
        path: "video-reel_01.png",
        absolutePath: path.join(evidenceDir, "video-reel_01.png"),
        kind: "video_frame",
        sourceKind: "video",
        sourceFile: path.join(studentDir, "reel.mp4"),
        sourceBasename: "reel.mp4",
        generated: true,
        frameIndex: 1,
      },
      {
        path: "../planning.png",
        absolutePath: path.join(studentDir, "planning.png"),
        kind: "image",
        sourceKind: "original_image",
        sourceFile: path.join(studentDir, "planning.png"),
        sourceBasename: "planning.png",
        generated: false,
      },
    ],
  }));
  const out = path.join(root, "contact-sheet.svg");
  const map = path.join(root, "contact-sheet.json");

  execFileSync(process.execPath, [
    SCRIPT,
    "--students-dir",
    studentsDir,
    "--out",
    out,
    "--map-out",
    map,
    "--mode",
    "video-first",
    "--slots",
    "2",
  ], { encoding: "utf8" });
  const mapping = JSON.parse(fs.readFileSync(map, "utf8"));

  assert.equal(mapping.students[0].selections.length, 2);
  assert.equal(mapping.students[0].selections.every((item) => item.kind === "video_frame"), true);
});

test("create-contact-sheet supports multi-slot visual selections outside video-first mode", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-contact-visual-slots-"));
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "local-001-StudentA");
  const evidenceDir = path.join(studentDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "final.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "process.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "page_01.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "review-assets.json"), JSON.stringify({
    schemaVersion: 2,
    evidenceComplete: true,
    evidenceItems: [
      { path: "final.png", absolutePath: path.join(evidenceDir, "final.png"), kind: "image", sourceKind: "original_image", sourceBasename: "final.png", generated: false },
      { path: "process.png", absolutePath: path.join(evidenceDir, "process.png"), kind: "image", sourceKind: "original_image", sourceBasename: "process.png", generated: false },
      { path: "page_01.png", absolutePath: path.join(evidenceDir, "page_01.png"), kind: "pdf_page", sourceKind: "pdf", sourceBasename: "report.pdf", generated: true },
    ],
  }));
  const out = path.join(root, "contact-sheet.svg");
  const map = path.join(root, "contact-sheet.json");

  execFileSync(process.execPath, [
    SCRIPT,
    "--students-dir",
    studentsDir,
    "--out",
    out,
    "--map-out",
    map,
    "--mode",
    "auto",
    "--slots",
    "3",
  ], { encoding: "utf8" });
  const mapping = JSON.parse(fs.readFileSync(map, "utf8"));

  assert.equal(mapping.students[0].selections.length, 3);
  assert.deepEqual(mapping.students[0].selections.map((item) => item.kind), ["image", "image", "pdf_page"]);
  assert.equal((mapping.students[0].selections[0].selectionIssues || []).includes("non_video_fallback_selected"), false);
});

test("create-contact-sheet writes paginated svg outputs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-contact-pages-"));
  const studentsDir = path.join(root, "students");
  for (let index = 1; index <= 7; index += 1) {
    const studentDir = path.join(studentsDir, `local-${String(index).padStart(3, "0")}-Student`);
    fs.mkdirSync(studentDir, { recursive: true });
    fs.writeFileSync(path.join(studentDir, "work.png"), "image");
  }
  const out = path.join(root, "contact-sheet.svg");
  const map = path.join(root, "contact-sheet.json");
  const pagePattern = path.join(root, "contact-sheet-page-{page}.svg");

  execFileSync(process.execPath, [
    SCRIPT,
    "--students-dir",
    studentsDir,
    "--out",
    out,
    "--map-out",
    map,
    "--page-out-pattern",
    pagePattern,
    "--students-per-page",
    "3",
  ], { encoding: "utf8" });
  const mapping = JSON.parse(fs.readFileSync(map, "utf8"));

  assert.equal(fs.existsSync(path.join(root, "contact-sheet-page-1.svg")), true);
  assert.equal(fs.existsSync(path.join(root, "contact-sheet-page-2.svg")), true);
  assert.equal(fs.existsSync(path.join(root, "contact-sheet-page-3.svg")), true);
  assert.deepEqual(mapping.pages.map((page) => page.studentKeys), [
    ["local-001", "local-002", "local-003"],
    ["local-004", "local-005", "local-006"],
    ["local-007"],
  ]);
});

test("create-contact-sheet can also render a PNG contact sheet", { skip: !pythonHasPillow() }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-contact-png-"));
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "local-001-StudentA");
  fs.mkdirSync(studentDir, { recursive: true });
  fs.writeFileSync(path.join(studentDir, "representative.png"), "not a real png");
  const out = path.join(root, "contact-sheet.svg");
  const map = path.join(root, "contact-sheet.json");
  const png = path.join(root, "contact-sheet.png");

  const stdout = execFileSync(process.execPath, [
    SCRIPT,
    "--students-dir",
    studentsDir,
    "--out",
    out,
    "--map-out",
    map,
    "--png-out",
    png,
  ], { encoding: "utf8" });
  const result = JSON.parse(stdout);

  assert.equal(result.pngOutPath, png);
  assert.equal(fs.existsSync(png), true);
  assert.ok(fs.statSync(png).size > 100);
});

test("create-contact-sheet writes missing required media slot notes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-contact-missing-slot-"));
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "local-001-StudentA");
  const evidenceDir = path.join(studentDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "video-final_01.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "review-assets.json"), JSON.stringify({
    schemaVersion: 2,
    evidenceComplete: true,
    evidenceItems: [{
      path: "video-final_01.png",
      absolutePath: path.join(evidenceDir, "video-final_01.png"),
      kind: "video_frame",
      sourceKind: "video",
      sourceFile: path.join(studentDir, "final.mp4"),
      sourceBasename: "final.mp4",
      generated: true,
      frameIndex: 1,
    }],
  }));
  const rubricPath = path.join(root, "rubric.cjs");
  fs.writeFileSync(rubricPath, `module.exports = ${JSON.stringify({
    schemaVersion: 1,
    kind: "fanya_rubric",
    courseName: "Course",
    assignmentName: "Assignment",
    status: "confirmed",
    reviewPriority: {
      recommendedMode: "fast_bundle",
      representativeMediaSlots: [
        { role: "primary_video", kinds: ["video_frame"], terms: ["final"], required: true },
        { role: "secondary_video", kinds: ["video_frame"], terms: ["reel"], required: true },
      ],
    },
  }, null, 2)};\n`, "utf8");
  const out = path.join(root, "contact-sheet.svg");
  const map = path.join(root, "contact-sheet.json");
  const notes = path.join(root, "contact-sheet-review-notes.json");

  execFileSync(process.execPath, [
    SCRIPT,
    "--students-dir",
    studentsDir,
    "--out",
    out,
    "--map-out",
    map,
    "--notes-out",
    notes,
    "--rubric-path",
    rubricPath,
    "--mode",
    "video-first",
    "--slots",
    "2",
  ], { encoding: "utf8" });
  const reviewNotes = JSON.parse(fs.readFileSync(notes, "utf8"));

  assert.equal(reviewNotes.notes.some((note) => (
    note.studentKey === "local-001"
    && note.issueCode === "missing_required_media_slot"
    && note.role === "secondary_video"
  )), true);
});

test("create-contact-sheet flags non-video fallback in video-first mode", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-contact-video-fallback-"));
  const studentsDir = path.join(root, "students");
  const studentDir = path.join(studentsDir, "local-001-StudentA");
  const evidenceDir = path.join(studentDir, "evidence");
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, "plan_image_01.png"), "image");
  fs.writeFileSync(path.join(evidenceDir, "review-assets.json"), JSON.stringify({
    schemaVersion: 2,
    evidenceComplete: true,
    evidenceItems: [{
      path: "plan_image_01.png",
      absolutePath: path.join(evidenceDir, "plan_image_01.png"),
      kind: "doc_image",
      sourceKind: "docx",
      sourceFile: path.join(studentDir, "plan.docx"),
      sourceBasename: "plan.docx",
      generated: true,
    }],
  }));
  const out = path.join(root, "contact-sheet.svg");
  const map = path.join(root, "contact-sheet.json");
  const notes = path.join(root, "contact-sheet-review-notes.json");

  execFileSync(process.execPath, [
    SCRIPT,
    "--students-dir",
    studentsDir,
    "--out",
    out,
    "--map-out",
    map,
    "--notes-out",
    notes,
    "--mode",
    "video-first",
  ], { encoding: "utf8" });
  const mapping = JSON.parse(fs.readFileSync(map, "utf8"));
  const reviewNotes = JSON.parse(fs.readFileSync(notes, "utf8"));

  assert.equal(mapping.students[0].selections[0].selectionIssues.includes("non_video_fallback_selected"), true);
  assert.equal(reviewNotes.notes.some((note) => note.issueCode === "video_first_no_video_frame"), true);
});
