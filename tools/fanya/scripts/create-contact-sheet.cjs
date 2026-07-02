const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { buildReviewLoadPlan } = require("./current-review-state.cjs");
const {
  itemsFromReviewAssets,
  selectEvidenceForContactSheet,
} = require("./evidence-selector.cjs");
const { loadRecord } = require("./record-store.cjs");
const { studentKeyFromDirName } = require("./student-identity.cjs");
const { loadSession } = require("./task-session.cjs");

const DEFAULT_REPRESENTATIVE_MEDIA_TERMS = [
  "成果排版",
  "排版",
  "海报",
  "成品",
  "最终",
  "效果",
  "效果图",
  "渲染",
  "渲染图",
  "作品",
  "截图",
  "画面",
  "视频帧",
  "抽帧",
  "帧",
  "模型",
  "场景",
  "角色",
  "2d",
  "3d",
  "poster",
  "layout",
  "board",
  "final",
  "render",
  "effect",
  "preview",
  "screenshot",
  "frame",
  "page",
];
const DEFAULT_PREFER = DEFAULT_REPRESENTATIVE_MEDIA_TERMS;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg"]);
const REVIEW_ASSETS_FILENAME = "review-assets.json";
const PREPARE_EVIDENCE_LOG_FILENAME = "prepare-evidence-log.json";

function createContactSheet({
  studentsDir,
  outPath,
  mapOutPath,
  notesOutPath = "",
  pngOutPath = "",
  pageOutPattern = "",
  pngOutPattern = "",
  studentsPerPage = 0,
  maxCellsPerPage = 48,
  prefer = DEFAULT_PREFER,
  preferExplicit = false,
  sessionPath = "",
  rubricPath = "",
  mode = "auto",
  slots = 1,
}) {
  if (!studentsDir) throw new Error("studentsDir is required");
  if (!outPath) throw new Error("outPath is required");
  const session = sessionPath ? loadSession(sessionPath) : null;
  const rubricPriority = loadRubricReviewPriority(rubricPath || session?.rubricPath);
  const students = listStudentDirs(studentsDir)
    .map((studentDir) => {
      const selection = selectRepresentativeImageDetails(studentDir, prefer, {
        rubricPriority,
        preferExplicit,
        mode,
        slots,
      });
      const selections = selection.selections || [];
      return {
        studentKey: studentKeyFromDirName(path.basename(studentDir)),
        studentDir,
        sourceImage: selection.filePath,
        selectionSource: selection.source,
        selectionIssues: selection.selectionIssues,
        slotIssues: selection.slotIssues,
        selections,
      };
    })
    .filter((item) => item.sourceImage);
  const notes = students.flatMap((student) => contactSheetNotes(student));
  const pages = paginateStudents(students, { studentsPerPage, maxCellsPerPage });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, renderSvg(students, outPath), "utf8");
  const pageOutputs = [];
  if (pageOutPattern) {
    for (const page of pages) {
      const pageOutPath = expandPagePattern(pageOutPattern, page.page);
      fs.mkdirSync(path.dirname(pageOutPath), { recursive: true });
      fs.writeFileSync(pageOutPath, renderSvg(page.students, pageOutPath), "utf8");
      pageOutputs.push(pageOutPath);
    }
  }

  if (mapOutPath) {
    fs.mkdirSync(path.dirname(mapOutPath), { recursive: true });
    writeContactSheetMap(mapOutPath, { students, pages });
  }
  if (notesOutPath) {
    fs.mkdirSync(path.dirname(notesOutPath), { recursive: true });
    fs.writeFileSync(notesOutPath, `${JSON.stringify({
      schemaVersion: 1,
      source: "bundle_contact_sheet",
      notes,
    }, null, 2)}\n`, "utf8");
  }
  if (pngOutPath) renderPngContactSheet({ mapOutPath, pngOutPath });
  const pngPageOutputs = [];
  if (pngOutPattern) {
    if (!pageOutPattern) throw new Error("--png-out-pattern requires --page-out-pattern");
    for (const page of pages) {
      const pngPageOutPath = expandPagePattern(pngOutPattern, page.page);
      const pageMapPath = `${path.dirname(pngPageOutPath)}${path.sep}${path.basename(pngPageOutPath, path.extname(pngPageOutPath))}.json`;
      fs.mkdirSync(path.dirname(pageMapPath), { recursive: true });
      writeContactSheetMap(pageMapPath, { students: page.students, pages: [page] });
      renderPngContactSheet({ mapOutPath: pageMapPath, pngOutPath: pngPageOutPath });
      pngPageOutputs.push(pngPageOutPath);
    }
  }

  return {
    contactSheetPath: outPath,
    mapOutPath: mapOutPath || "",
    notesOutPath: notesOutPath || "",
    pngOutPath: pngOutPath || "",
    pageOutputs,
    pngPageOutputs,
    students,
    notes,
    pages,
  };
}

function writeContactSheetMap(mapOutPath, { students, pages }) {
  fs.writeFileSync(mapOutPath, `${JSON.stringify({
    schemaVersion: 1,
    source: "bundle_contact_sheet",
    students,
    pages: (pages || []).map((page) => ({
      page: page.page,
      studentKeys: page.students.map((student) => student.studentKey),
    })),
  }, null, 2)}\n`, "utf8");
}

function renderPngContactSheet({ mapOutPath, pngOutPath }) {
  if (!mapOutPath) throw new Error("--png-out requires --map-out so the PNG renderer can read the contact sheet mapping");
  const python = process.env.PYTHON || "python";
  const scriptPath = path.join(__dirname, "contact-sheet-png.py");
  try {
    execFileSync(python, [scriptPath, "--map", mapOutPath, "--out", pngOutPath], { encoding: "utf8" });
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr).trim() : "";
    const stdout = error.stdout ? String(error.stdout).trim() : "";
    const detail = stderr || stdout || error.message;
    throw new Error(`PNG contact sheet failed: ${detail}`);
  }
}

function paginateStudents(students, { studentsPerPage = 0, maxCellsPerPage = 48 } = {}) {
  const parsedStudentsPerPage = Number.parseInt(studentsPerPage, 10);
  const parsedMaxCellsPerPage = Number.parseInt(maxCellsPerPage, 10);
  const maxSelections = Math.max(1, ...students.map((student) => student.selections?.length || 1));
  const effectiveStudentsPerPage = parsedStudentsPerPage > 0
    ? parsedStudentsPerPage
    : Math.max(1, Math.floor((parsedMaxCellsPerPage > 0 ? parsedMaxCellsPerPage : 48) / maxSelections));
  const pages = [];
  for (let index = 0; index < students.length; index += effectiveStudentsPerPage) {
    pages.push({
      page: pages.length + 1,
      students: students.slice(index, index + effectiveStudentsPerPage),
    });
  }
  return pages;
}

function expandPagePattern(pattern, page) {
  return String(pattern).replace("{page}", String(page));
}

function selectRepresentativeImage(studentDir, prefer = DEFAULT_PREFER, { rubricPriority = [], preferExplicit = false } = {}) {
  return selectRepresentativeImageDetails(studentDir, prefer, {
    rubricPriority,
    preferExplicit: preferExplicit || arguments.length >= 2,
  }).filePath;
}

function selectRepresentativeImageDetails(
  studentDir,
  prefer = DEFAULT_PREFER,
  { rubricPriority = [], preferExplicit = false, mode = "auto", slots = 1 } = {},
) {
  const { evidenceItems, source } = evidenceItemsForStudent(studentDir, rubricPriority);
  if (evidenceItems.length === 0) return selectionDetails({ filePath: "", studentDir, source, selections: [] });
  const explicitPreferTerms = preferExplicit || source === "fallback"
    ? normalizeTerms(prefer)
    : [];
  const selected = selectEvidenceForContactSheet({
    evidenceItems,
    rubricPriority,
    mode,
    slots,
    explicitPreferTerms,
  });
  const selections = selected
    .filter((selection) => selection.item?.absolutePath && isImageFile(selection.item.absolutePath))
    .map((selection) => selectionToContactSheetItem(selection, studentDir, source));
  const slotIssues = selected
    .filter((selection) => !selection.item && selection.issues.length)
    .map((selection) => ({
      role: selection.slot.role,
      issueCodes: selection.issues,
    }));
  if (selections.length === 0) return selectionDetails({ filePath: "", studentDir, source, selections: [] });
  const first = selections[0];
  return {
    filePath: first.sourceImage,
    source,
    selectionIssues: first.selectionIssues,
    slotIssues,
    selections,
  };
}

function evidenceItemsForStudent(studentDir, rubricPriority) {
  const evidenceDir = path.join(studentDir, "evidence");
  const reviewAssetsPath = path.join(evidenceDir, REVIEW_ASSETS_FILENAME);
  if (!fs.existsSync(reviewAssetsPath)) {
    return {
      source: "fallback",
      evidenceItems: collectImages(studentDir).map((filePath, index) => imageItem({ evidenceDir, filePath, index, generated: false })),
    };
  }
  const reviewAssets = JSON.parse(fs.readFileSync(reviewAssetsPath, "utf8"));
  if (Array.isArray(reviewAssets.evidenceItems) && reviewAssets.evidenceItems.length) {
    return { source: "primary", evidenceItems: itemsFromReviewAssets({ evidenceDir, reviewAssets }) };
  }
  const externalViewable = (reviewAssets.externalViewable || [])
    .map((relativePath) => path.resolve(evidenceDir, relativePath));
  const generatedEvidence = listGeneratedEvidence(evidenceDir);
  const plan = buildReviewLoadPlan({
    externalViewable,
    generatedEvidence,
    rubricPriority,
  });
  const orderedFiles = plan.primaryFiles.filter(isImageFile);
  if (orderedFiles.length) {
    return {
      source: "primary",
      evidenceItems: orderedFiles.map((filePath, index) => imageItem({
        evidenceDir,
        filePath,
        index,
        generated: filePath.startsWith(evidenceDir),
      })),
    };
  }
  return {
    source: "fallback",
    evidenceItems: collectImages(studentDir).map((filePath, index) => imageItem({ evidenceDir, filePath, index, generated: false })),
  };
}

function collectImages(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) return collectImages(fullPath);
      if (!entry.isFile()) return [];
      return IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ? [fullPath] : [];
    })
    .sort();
}

function preferredRank(filename, terms) {
  const normalized = normalizeTerm(filename);
  const matchIndex = terms.findIndex((term) => normalized.includes(term));
  return matchIndex === -1 ? terms.length + 1 : matchIndex;
}

function normalizeTerms(terms) {
  return (Array.isArray(terms) ? terms : [])
    .map((term) => normalizeTerm(term))
    .filter(Boolean);
}

function normalizeTerm(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_\-.()[\]{}]+/gu, "");
}

function isImageFile(filePath) {
  return IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function selectionDetails({ filePath, studentDir, source }) {
  const selectionIssues = [];
  if (filePath && source === "fallback" && looksLikeDocumentCover(studentDir, filePath)) {
    selectionIssues.push("document_cover_selected", "needs_representative_image_review");
  }
  return { filePath, source, selectionIssues };
}

function selectionToContactSheetItem(selection, studentDir, source) {
  const item = selection.item;
  const selectionIssues = [
    ...selection.issues,
    ...(source === "fallback" && looksLikeDocumentCover(studentDir, item.absolutePath)
      ? ["document_cover_selected", "needs_representative_image_review"]
      : []),
  ];
  return {
    role: selection.slot.role,
    label: selection.slot.label,
    sourceImage: item.absolutePath,
    kind: item.kind,
    sourceKind: item.sourceKind,
    sourceFile: item.sourceFile || "",
    sourceBasename: item.sourceBasename || "",
    selectionReason: source,
    selectionIssues: Array.from(new Set(selectionIssues)),
  };
}

function imageItem({ evidenceDir, filePath, index, generated }) {
  return {
    path: path.relative(evidenceDir, filePath).replace(/\\/g, "/"),
    absolutePath: path.resolve(filePath),
    kind: "image",
    sourceKind: generated ? "unsupported" : "original_image",
    sourceFile: path.resolve(filePath),
    sourceBasename: path.basename(filePath),
    generated,
    index,
  };
}

function looksLikeDocumentCover(studentDir, filePath) {
  const searchable = normalizeTerm(path.relative(studentDir, filePath));
  return [
    "cover",
    "reportcover",
    "pptcover",
    "presentationcover",
    "documentcover",
    "封面",
    "报告封面",
  ].some((term) => searchable.includes(normalizeTerm(term)));
}

function contactSheetNotes(student) {
  const selectionNotes = (student.selections || []).flatMap((selection) => (
    (selection.selectionIssues || []).map((issueCode) => ({
      studentKey: student.studentKey,
      role: selection.role,
      issueCode,
      sourceImage: selection.sourceImage,
      internalNote: noteMessage(issueCode),
      suggestedAction: "Open primaryFiles or fallbackFiles to find a more representative image for this assignment.",
    }))
  ));
  const slotNotes = (student.slotIssues || []).flatMap((slotIssue) => (
    (slotIssue.issueCodes || []).map((issueCode) => ({
      studentKey: student.studentKey,
      role: slotIssue.role,
      issueCode,
      sourceImage: "",
      internalNote: noteMessage(issueCode),
      suggestedAction: "Open primaryFiles or fallbackFiles to find a more representative image for this assignment.",
    }))
  ));
  return [...selectionNotes, ...slotNotes];
}

function noteMessage(issueCode) {
  if (issueCode === "missing_required_media_slot") return "A required representative media slot could not be filled.";
  if (issueCode === "video_first_no_video_frame") return "Video-first mode found no video frame evidence for this student.";
  if (issueCode === "non_video_fallback_selected") return "Video-first mode had to select non-video evidence.";
  if (issueCode === "document_image_selected") return "Selected evidence appears to be generated from a document or presentation.";
  if (issueCode === "document_cover_selected") return "Fallback image appears to be a document, report, or presentation cover rather than representative work evidence.";
  return "Representative media selection needs review.";
}

function listGeneratedEvidence(evidenceDir) {
  if (!fs.existsSync(evidenceDir)) return [];
  return fs.readdirSync(evidenceDir)
    .filter((name) => name !== REVIEW_ASSETS_FILENAME && name !== PREPARE_EVIDENCE_LOG_FILENAME)
    .map((name) => path.join(evidenceDir, name))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .sort();
}

function preferredTermsFromRubric(rubricPath) {
  if (!rubricPath) return DEFAULT_PREFER;
  try {
    const rubric = loadRecord(rubricPath);
    const terms = rubric.reviewPriority?.representativeMediaTerms;
    return Array.isArray(terms) && terms.length ? terms : DEFAULT_PREFER;
  } catch {
    return DEFAULT_PREFER;
  }
}

function loadRubricReviewPriority(rubricPath) {
  if (!rubricPath || !fs.existsSync(rubricPath)) return [];
  try {
    const rubric = loadRecord(rubricPath);
    if (Array.isArray(rubric.reviewPriority)) return rubric.reviewPriority;
    if (rubric.reviewPriority && typeof rubric.reviewPriority === "object") return rubric.reviewPriority;
    return [];
  } catch {
    return [];
  }
}

function listStudentDirs(studentsDir) {
  return fs.readdirSync(studentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(studentsDir, entry.name))
    .sort();
}

function renderSvg(students, outPath) {
  const maxSelections = Math.max(1, ...students.map((student) => student.selections?.length || 1));
  const cellWidth = Math.max(220, 84 * maxSelections + 32);
  const cellHeight = 190;
  const cols = maxSelections >= 5 ? 2 : 4;
  const rows = Math.max(1, Math.ceil(students.length / cols));
  const width = cols * cellWidth;
  const height = rows * cellHeight;
  const cells = students.map((student, index) => {
    const x = (index % cols) * cellWidth;
    const y = Math.floor(index / cols) * cellHeight;
    const selections = student.selections?.length
      ? student.selections
      : [{ sourceImage: student.sourceImage, role: "" }];
    const imageWidth = (cellWidth - 32) / selections.length;
    const images = selections.map((selection, selectionIndex) => {
      const href = path.relative(path.dirname(outPath), selection.sourceImage).replace(/\\/g, "/");
      const imageX = x + 16 + (selectionIndex * imageWidth);
      return [
        `<image href="${escapeXml(href)}" x="${imageX}" y="${y + 16}" width="${imageWidth - 4}" height="${cellHeight - 62}" preserveAspectRatio="xMidYMid meet"/>`,
        selection.role
          ? `<text x="${imageX}" y="${y + cellHeight - 42}" font-family="Arial, sans-serif" font-size="9" fill="#666">${escapeXml(selection.role)}</text>`
          : "",
      ].filter(Boolean).join("\n");
    }).join("\n");
    return [
      `<rect x="${x + 8}" y="${y + 8}" width="${cellWidth - 16}" height="${cellHeight - 16}" fill="#fff" stroke="#ddd"/>`,
      images,
      `<text x="${x + 16}" y="${y + cellHeight - 22}" font-family="Arial, sans-serif" font-size="12" fill="#333">${escapeXml(student.studentKey)}</text>`,
    ].join("\n");
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n<rect width="100%" height="100%" fill="#f6f6f6"/>\n${cells}\n</svg>\n`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key?.startsWith("--")) continue;
    args[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

function main(argv) {
  const args = parseArgs(argv);
  const prefer = args.prefer
    ? args.prefer.split(",")
    : preferredTermsFromRubric(args["rubric-path"]);
  const result = createContactSheet({
    studentsDir: args["students-dir"],
    outPath: args.out,
    mapOutPath: args["map-out"],
    notesOutPath: args["notes-out"],
    pngOutPath: args["png-out"],
    pageOutPattern: args["page-out-pattern"],
    pngOutPattern: args["png-out-pattern"],
    studentsPerPage: args["students-per-page"] || 0,
    maxCellsPerPage: args["max-cells-per-page"] || 48,
    prefer,
    preferExplicit: !!args.prefer,
    sessionPath: args["session-path"],
    rubricPath: args["rubric-path"],
    mode: args.mode || "auto",
    slots: args.slots || 1,
  });
  process.stdout.write(`${JSON.stringify({
    status: "created_contact_sheet",
    contactSheetPath: result.contactSheetPath,
    mapOutPath: result.mapOutPath,
    notesOutPath: result.notesOutPath,
    pngOutPath: result.pngOutPath,
    pageOutputs: result.pageOutputs,
    pngPageOutputs: result.pngPageOutputs,
    studentCount: result.students.length,
    pageCount: result.pages.length,
    noteCount: result.notes.length,
  }, null, 2)}\n`);
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
  DEFAULT_REPRESENTATIVE_MEDIA_TERMS,
  createContactSheet,
  preferredTermsFromRubric,
  paginateStudents,
  selectRepresentativeImage,
  selectRepresentativeImageDetails,
};
