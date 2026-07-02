const fs = require("node:fs");
const path = require("node:path");

const { sanitizePathPart } = require("./attachment-utils.cjs");

const RESULT_KIND = "fanya_result";
const RUBRIC_KIND = "fanya_rubric";
const SKIPPED_LABEL = "\u5df2\u8df3\u8fc7";
const MANUAL_REVIEW_LABEL = "\u9700\u8981\u4eba\u5de5\u590d\u6838";
const { validateStudentFacingComment } = require("./review-text-quality.cjs");

function createResultRecordFile({ outputDir = "result", courseName, assignmentName, rubricPath = "", resultPath, date }) {
  if (!courseName) throw new Error("courseName is required");
  if (!assignmentName) throw new Error("assignmentName is required");
  const day = date || new Date().toISOString().slice(0, 10);
  const finalPath = resultPath || path.join(outputDir, `${sanitizePathPart(courseName)}-\u4f5c\u4e1a\u8bc4\u4ef7\u6c47\u603b-${day}.cjs`);
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  if (fs.existsSync(finalPath)) return finalPath;

  saveRecord(finalPath, {
    schemaVersion: 1,
    kind: RESULT_KIND,
    courseName,
    gradingRules: defaultGradingRules(),
    assignments: [
      {
        assignmentName,
        rubricPath,
        assignmentSummary: "",
        reviews: [],
        draftReviews: [],
      },
    ],
  });
  return finalPath;
}

function createRubricRecordFile({
  outputDir,
  courseName,
  assignmentName,
  assignmentSummary = "",
  dimensions = [],
  reviewPriority = defaultReviewPriority(),
  scoreBands = defaultScoreBands(),
  status = "draft",
  rubricPath,
}) {
  if (!outputDir && !rubricPath) throw new Error("outputDir or rubricPath is required");
  if (!courseName) throw new Error("courseName is required");
  if (!assignmentName) throw new Error("assignmentName is required");
  const finalPath = rubricPath || path.join(outputDir, `${sanitizePathPart(assignmentName)}-rubric.cjs`);
  fs.mkdirSync(path.dirname(finalPath), { recursive: true });
  if (fs.existsSync(finalPath)) return finalPath;

  saveRecord(finalPath, {
    schemaVersion: 1,
    kind: RUBRIC_KIND,
    courseName,
    assignmentName,
    status,
    assignmentSummary,
    dimensions,
    reviewPriority,
    scoreBands,
  });
  return finalPath;
}

function appendStudentReview({ resultPath, assignmentName, review }) {
  const record = loadRecord(resultPath);
  assertResultRecord(record);
  const assignment = getOrCreateAssignment(record, assignmentName);
  const existing = assignment.reviews.find((item) => item.studentKey === review.studentKey);
  if (existing) return { appended: false, existing };

  const normalized = normalizeReview(review);
  assignment.reviews.push(normalized);
  saveRecord(resultPath, record);
  return { appended: true, review: normalized };
}

function upsertDraftReviews({ resultPath, assignmentName, drafts }) {
  const record = loadRecord(resultPath);
  assertResultRecord(record);
  const assignment = getOrCreateAssignment(record, assignmentName);
  assignment.draftReviews ||= [];
  const updated = [];
  const skippedBecauseFinalExists = [];

  for (const draft of drafts || []) {
    const normalized = normalizeDraftReview(draft);
    const finalExists = assignment.reviews.some((review) => review.studentKey === normalized.studentKey);
    if (finalExists) {
      skippedBecauseFinalExists.push(normalized.studentKey);
      continue;
    }
    const existingIndex = assignment.draftReviews.findIndex((item) => item.studentKey === normalized.studentKey);
    if (existingIndex === -1) {
      assignment.draftReviews.push(normalized);
    } else {
      assignment.draftReviews[existingIndex] = normalized;
    }
    updated.push(normalized.studentKey);
  }

  saveRecord(resultPath, record);
  return {
    updated,
    skippedBecauseFinalExists,
    draftCount: assignment.draftReviews.length,
  };
}

function syncRecordContext({ recordPath, courseName, assignmentName, previousAssignmentName }) {
  const record = loadRecord(recordPath);
  let updated = false;

  if (courseName && record.courseName !== courseName) {
    record.courseName = courseName;
    updated = true;
  }

  if (record.kind === RUBRIC_KIND) {
    if (assignmentName && record.assignmentName !== assignmentName) {
      record.assignmentName = assignmentName;
      updated = true;
    }
  } else if (record.kind === RESULT_KIND) {
    const assignment = findAssignmentForSync(record, previousAssignmentName || assignmentName);
    if (assignment && assignmentName && assignment.assignmentName !== assignmentName) {
      assignment.assignmentName = assignmentName;
      updated = true;
    }
  } else {
    throw new Error("Expected fanya_result or fanya_rubric record");
  }

  if (updated) saveRecord(recordPath, record);
  return { updated, record };
}

function extractHandledStudentKeys({ resultPath, assignmentName }) {
  return assignmentReviews(resultPath, assignmentName).map((review) => review.studentKey);
}

function extractCompletedStudentKeys({ resultPath, assignmentName }) {
  return assignmentReviews(resultPath, assignmentName)
    .filter((review) => review.status !== "skipped")
    .map((review) => review.studentKey);
}

function extractSkippedStudentKeys({ resultPath, assignmentName }) {
  return assignmentReviews(resultPath, assignmentName)
    .filter((review) => review.status === "skipped")
    .map((review) => review.studentKey);
}

function assignmentReviews(resultPath, assignmentName) {
  if (!resultPath || !fs.existsSync(resultPath)) return [];
  const record = loadRecord(resultPath);
  assertResultRecord(record);
  const assignment = findAssignment(record, assignmentName);
  return assignment ? assignment.reviews.filter((review) => review.studentKey) : [];
}

function assignmentDraftReviews(resultPath, assignmentName) {
  if (!resultPath || !fs.existsSync(resultPath)) return [];
  const record = loadRecord(resultPath);
  assertResultRecord(record);
  const assignment = findAssignment(record, assignmentName);
  return assignment ? (assignment.draftReviews || []).filter((review) => review.studentKey) : [];
}

function loadRecord(recordPath) {
  const resolved = path.resolve(recordPath);
  delete require.cache[resolved];
  const record = require(resolved);
  return clone(record);
}

function saveRecord(recordPath, record) {
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, `module.exports = ${JSON.stringify(record, null, 2)};\n`, "utf8");
}

function findAssignment(record, assignmentName) {
  const target = normalizeName(assignmentName);
  return record.assignments.find((assignment) => normalizeName(assignment.assignmentName) === target);
}

function getOrCreateAssignment(record, assignmentName) {
  const existing = findAssignment(record, assignmentName);
  if (existing) return existing;
  const assignment = { assignmentName, rubricPath: "", assignmentSummary: "", reviews: [], draftReviews: [] };
  record.assignments.push(assignment);
  return assignment;
}

function findAssignmentForSync(record, assignmentName) {
  if (!record.assignments || record.assignments.length === 0) return null;
  if (assignmentName) {
    const matched = findAssignment(record, assignmentName);
    if (matched) return matched;
  }
  return record.assignments.length === 1 ? record.assignments[0] : null;
}

function normalizeReview(review) {
  if (!review.studentKey) throw new Error("review.studentKey is required");
  const status = review.status || "reviewed";
  return {
    studentName: review.studentName || "",
    studentKey: review.studentKey,
    submissionSummary: review.submissionSummary || "",
    suggestedScore: review.suggestedScore ?? null,
    comment: review.comment || defaultCommentForStatus(status),
    status,
    statusReason: review.statusReason || defaultReasonForStatus(status),
  };
}

function normalizeDraftReview(review) {
  if (!review.studentKey) throw new Error("draft.studentKey is required");
  const comment = review.comment || "";
  validateStudentFacingComment(comment);
  return {
    studentName: review.studentName || "",
    studentKey: review.studentKey,
    suggestedScore: review.suggestedScore ?? null,
    comment,
    reviewNotes: Array.isArray(review.reviewNotes) ? clone(review.reviewNotes) : [],
    source: review.source || "contact_sheet_first_pass",
    status: "draft",
  };
}

function defaultCommentForStatus(status) {
  if (status === "skipped") return SKIPPED_LABEL;
  if (status === "manual_review") return MANUAL_REVIEW_LABEL;
  return "";
}

function defaultReasonForStatus(status) {
  if (status === "skipped") return "user_skipped";
  if (status === "manual_review") return "manual_review";
  return "";
}

function defaultGradingRules() {
  return [
    "\u6ee1\u5206 100 \u5206\u3002",
    "90-100\uff1a\u7279\u522b\u4f18\u79c0\uff0c\u53ea\u7ed9\u5c11\u6570\u660e\u663e\u4f18\u79c0\u4f5c\u54c1\u3002",
    "80-89\uff1a\u666e\u901a\u5230\u826f\u597d\uff0c\u5927\u591a\u6570\u4f5c\u54c1\u5e94\u843d\u5728\u8fd9\u4e2a\u533a\u95f4\u3002",
    "70-79\uff1a\u5b58\u5728\u4e2d\u7b49\u6216\u8f83\u5927\u95ee\u9898\u3002",
    "0-69\uff1a\u5927\u95ee\u9898\u3001\u660e\u663e\u6577\u884d\u3001\u7f3a\u9879\u4e25\u91cd\u6216\u65e0\u6cd5\u6709\u6548\u67e5\u770b\u3002",
  ];
}

function defaultScoreBands() {
  return [
    { range: "90-100", meaning: "\u7279\u522b\u4f18\u79c0" },
    { range: "80-89", meaning: "\u666e\u901a\u5230\u826f\u597d" },
    { range: "70-79", meaning: "\u4e2d\u7b49\u6216\u8f83\u5927\u95ee\u9898" },
    { range: "0-69", meaning: "\u5927\u95ee\u9898\u6216\u660e\u663e\u6577\u884d" },
  ];
}

function defaultReviewPriority() {
  return {
    recommendedMode: "fast_bundle",
    suitableFor: ["visual", "video", "pdf", "image", "mixed_doc_visual", "text_document"],
    primaryEvidence: [
      "Use assignment-specific deliverables from the confirmed rubric first.",
      "For visual submissions, inspect representative final images, layout boards, posters, PDF previews, or video frames.",
      "For document-heavy submissions, read evidence/review-text.md before opening lower-priority files.",
    ],
    secondaryEvidence: [
      "Open source archives, full slide decks, textures, or extra support files only when the score band is unclear.",
    ],
    representativeMediaRules: {
      videoFrameCount: 3,
      pdfMaxPages: 3,
    },
    representativeMediaSlots: [],
    representativeMediaTerms: [],
    commentRule: "Write personalized, specific 2-3 sentence comments by default.",
    stopRule: "Stop reading lower-priority evidence once the inspected files justify a fair score band.",
    fallbackRule: "Inspect more evidence for possible 90+ scores, low scores, blank/abnormal evidence, missing required deliverables, or conflicting evidence.",
  };
}

function assertResultRecord(record) {
  if (record?.kind !== RESULT_KIND) throw new Error("Expected fanya_result record");
}

function normalizeName(value) {
  return String(value ?? "").trim().replace(/\s+/gu, "").toLowerCase();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  RESULT_KIND,
  RUBRIC_KIND,
  appendStudentReview,
  assignmentDraftReviews,
  createResultRecordFile,
  createRubricRecordFile,
  defaultReviewPriority,
  extractCompletedStudentKeys,
  extractHandledStudentKeys,
  extractSkippedStudentKeys,
  loadRecord,
  saveRecord,
  syncRecordContext,
  upsertDraftReviews,
};
