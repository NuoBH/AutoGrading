const fs = require("node:fs");
const path = require("node:path");

const { buildStudentTmpDir } = require("./attachment-utils.cjs");
const {
  buildEvidenceLoadPlan,
  itemsFromReviewAssets,
} = require("./evidence-selector.cjs");
const { loadRecord } = require("./record-store.cjs");
const { loadStudentIndex, studentKeysFromIndex } = require("./student-index.cjs");
const { studentKeyFromDirName } = require("./student-identity.cjs");
const { DEFAULT_SESSION_PATH, loadSession, nextStudentKey } = require("./task-session.cjs");

const REVIEW_ASSETS_FILENAME = "review-assets.json";
const PREPARE_EVIDENCE_LOG_FILENAME = "prepare-evidence-log.json";

function currentReviewState({ sessionPath = DEFAULT_SESSION_PATH } = {}) {
  const session = loadSession(sessionPath);
  const index = loadStudentIndex(session.studentIndexPath);
  const studentKeys = studentKeysFromIndex(index);
  const handled = new Set([
    ...(session.completedStudentKeys || []),
    ...(session.skippedStudentKeys || []),
  ]);
  const selectedKey = session.currentStudentKey && !handled.has(session.currentStudentKey)
    ? session.currentStudentKey
    : nextStudentKey(session, studentKeys);
  const studentIndex = index.students.findIndex((student) => student.studentKey === selectedKey);
  const student = index.students[studentIndex] || null;
  const studentDir = resolveStudentDir({ session, studentKey: selectedKey, studentIndex });
  const evidenceDir = studentDir ? path.join(studentDir, "evidence") : "";
  const reviewAssetsPath = evidenceDir ? path.join(evidenceDir, REVIEW_ASSETS_FILENAME) : "";
  const reviewAssets = readJsonIfExists(reviewAssetsPath);
  const isWebMode = session.reviewMode === "web_download";
  const evidenceReady = !!reviewAssets;
  const evidenceComplete = reviewAssets?.evidenceComplete === true;
  const mustReadLog = reviewAssets ? !evidenceComplete : false;
  const prepareEvidenceLogPath = mustReadLog ? path.join(evidenceDir, PREPARE_EVIDENCE_LOG_FILENAME) : null;
  const webReviewUrl = isWebMode ? (student?.reviewUrl || null) : null;
  const externalViewable = resolveExternalViewable(evidenceDir, reviewAssets);
  const generatedEvidence = listGeneratedEvidence(evidenceDir);
  const rubricPriority = loadRubricReviewPriority(session.rubricPath);
  const evidenceItems = Array.isArray(reviewAssets?.evidenceItems)
    ? itemsFromReviewAssets({ evidenceDir, reviewAssets })
    : [];

  return {
    sessionPath,
    courseName: session.courseName,
    assignmentName: session.assignmentName,
    reviewMode: session.reviewMode,
    resultPath: session.resultPath,
    rubricPath: session.rubricPath,
    reviewSourcePath: session.reviewSourcePath,
    studentIndexPath: session.studentIndexPath,
    studentsDir: session.studentsDir,
    currentStudentKey: selectedKey || null,
    student,
    studentOrdinal: studentIndex >= 0 ? studentIndex + 1 : null,
    studentDir,
    evidenceDir,
    reviewAssetsPath,
    evidenceReady,
    reviewAssets,
    evidenceComplete: reviewAssets ? evidenceComplete : null,
    mustReadLog,
    prepareEvidenceLogPath,
    webReviewUrl,
    needsBrowserReviewPage: isWebMode && !!webReviewUrl && !evidenceReady,
    needsAttachmentDownload: isWebMode && !!webReviewUrl && !evidenceReady,
    externalViewable,
    generatedEvidence,
    evidenceItems,
    reviewLoadPlan: buildReviewLoadPlan({
      evidenceItems,
      externalViewable,
      generatedEvidence,
      mustReadLog,
      prepareEvidenceLogPath,
      rubricPriority,
    }),
    alreadyReviewedInResult: isReviewedInResult(session, selectedKey),
    nextStudentKey: nextStudentKey(session, studentKeys),
    remainingStudentKeys: studentKeys.filter((key) => !handled.has(key)),
  };
}

function buildReviewLoadPlan({
  externalViewable = [],
  generatedEvidence = [],
  evidenceItems = [],
  mustReadLog = false,
  prepareEvidenceLogPath = null,
  rubricPriority = [],
}) {
  const plan = buildEvidenceLoadPlan({
    evidenceItems,
    externalViewable,
    generatedEvidence,
    rubricPriority,
  });
  return {
    ...plan,
    mustReadLogInitially: false,
    readLogOnlyIfNeeded: mustReadLog,
    prepareEvidenceLogPath: mustReadLog ? prepareEvidenceLogPath : null,
  };
}

function evidencePriority(filePath, rubricPriority = []) {
  const name = path.basename(filePath).toLowerCase();
  if (name === "review-text.md") return -100;
  if (matchesAnyTerm(name, rubricPriority?.representativeMediaTerms)) return -80;
  if (matchesAnyTerm(name, rubricPriority?.primaryEvidence)) return -70;
  if (/(final|render|poster|layout|board|effect|hero|海报|排版|效果|成品|渲染)/u.test(name)) return 0;
  if (/(report|summary|实训报告|报告|总结|说明|(^|[_-])text([._-]|$))/u.test(name)) return 1;
  if (/(slide|ppt|presentation|汇报)/u.test(name)) return 2;
  if (/(source|model|texture|archive|asset|源文件|模型|贴图|归档)/u.test(name)) return 4;
  return 3;
}

function matchesAnyTerm(fileName, terms) {
  const normalizedName = normalizeSearchText(fileName);
  return normalizedTerms(terms).some((term) => normalizedName.includes(term));
}

function normalizedTerms(terms) {
  if (!Array.isArray(terms)) return [];
  return terms
    .flatMap((term) => splitPriorityTerm(term))
    .map((term) => normalizeSearchText(term))
    .filter(Boolean);
}

function splitPriorityTerm(term) {
  if (typeof term !== "string") return [];
  return term
    .split(/[;,，、\n\r]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeSearchText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\s_\-.()[\]{}]+/gu, "");
}

function resolveStudentDir({ session, studentKey, studentIndex }) {
  if (!studentKey) return "";
  const bundleDir = findStudentDirByKey(session.studentsDir, studentKey);
  if (bundleDir) return bundleDir;
  if (session.localWorkIndex && studentIndex >= 0) {
    return buildStudentTmpDir({ workIndex: session.localWorkIndex, studentIndex: studentIndex + 1 });
  }
  return "";
}

function findStudentDirByKey(studentsDir, studentKey) {
  if (!studentsDir || !fs.existsSync(studentsDir)) return "";
  const entry = fs.readdirSync(studentsDir, { withFileTypes: true })
    .find((item) => item.isDirectory() && studentKeyFromDirName(item.name) === studentKey);
  return entry ? path.join(studentsDir, entry.name) : "";
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveExternalViewable(evidenceDir, reviewAssets) {
  return (reviewAssets?.externalViewable || []).map((relativePath) => path.resolve(evidenceDir, relativePath));
}

function listGeneratedEvidence(evidenceDir) {
  if (!evidenceDir || !fs.existsSync(evidenceDir)) return [];
  return fs.readdirSync(evidenceDir)
    .filter((name) => name !== REVIEW_ASSETS_FILENAME && name !== PREPARE_EVIDENCE_LOG_FILENAME)
    .map((name) => path.join(evidenceDir, name))
    .filter((filePath) => fs.statSync(filePath).isFile())
    .sort();
}

function isReviewedInResult(session, studentKey) {
  if (!studentKey || !session.resultPath || !fs.existsSync(session.resultPath)) return false;
  const record = loadRecord(session.resultPath);
  const assignment = (record.assignments || []).find((item) => item.assignmentName === session.assignmentName);
  return !!assignment?.reviews?.some((review) => review.studentKey === studentKey);
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

function main(argv) {
  const sessionPath = argValue(argv, "--session-path") || DEFAULT_SESSION_PATH;
  process.stdout.write(`${JSON.stringify(currentReviewState({ sessionPath }), null, 2)}\n`);
}

function argValue(argv, key) {
  const index = argv.indexOf(key);
  return index === -1 ? "" : argv[index + 1];
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
  buildReviewLoadPlan,
  currentReviewState,
  findStudentDirByKey,
};
