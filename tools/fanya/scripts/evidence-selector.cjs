const path = require("node:path");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg"]);
const NON_VISUAL_KINDS = new Set(["doc_text", "text_bundle", "unsupported"]);
const DOCUMENT_DERIVED_KINDS = new Set(["doc_image", "doc_text", "text_bundle"]);

function itemsFromReviewAssets({ evidenceDir, reviewAssets }) {
  if (!reviewAssets) return [];
  if (Array.isArray(reviewAssets.evidenceItems) && reviewAssets.evidenceItems.length) {
    return reviewAssets.evidenceItems.map((item, index) => normalizeEvidenceItem(item, evidenceDir, index));
  }
  return [
    ...(reviewAssets.externalViewable || []).map((relativePath, index) => compatibilityItem({
      evidenceDir,
      relativePath,
      index,
      generated: false,
    })),
    ...(reviewAssets.generatedEvidence || []).map((relativePath, index) => compatibilityItem({
      evidenceDir,
      relativePath,
      index,
      generated: true,
    })),
    ...(reviewAssets.reviewText ? [compatibilityItem({
      evidenceDir,
      relativePath: reviewAssets.reviewText,
      index: 100000,
      generated: true,
      kind: "text_bundle",
      sourceKind: "text",
    })] : []),
  ].filter(Boolean);
}

function buildEvidenceLoadPlan({
  evidenceItems = [],
  externalViewable = [],
  generatedEvidence = [],
  rubricPriority = {},
  maxInitialFiles = 4,
}) {
  const items = evidenceItems.length
    ? evidenceItems
    : [
      ...externalViewable.map((filePath, index) => filePathItem(filePath, index, false)),
      ...generatedEvidence.map((filePath, index) => filePathItem(filePath, index + externalViewable.length, true)),
    ];
  const ranked = items
    .map((item, index) => ({
      ...item,
      index: item.index ?? index,
      priority: evidencePriority(item.absolutePath || item.path || "", rubricPriority, item),
    }))
    .sort((left, right) => (
      left.priority - right.priority
      || (left.index ?? 0) - (right.index ?? 0)
      || String(left.absolutePath || "").localeCompare(String(right.absolutePath || ""))
    ));
  const primaryItems = ranked.slice(0, maxInitialFiles);
  const primaryPaths = new Set(primaryItems.map((item) => item.absolutePath));
  const fallbackItems = ranked.filter((item) => !primaryPaths.has(item.absolutePath));
  return {
    mode: "minimal_first_pass",
    maxInitialFiles,
    primaryItems,
    fallbackItems,
    primaryFiles: primaryItems.map((item) => item.absolutePath),
    fallbackFiles: fallbackItems.map((item) => item.absolutePath),
    rubricPriority,
    stopRule: "Once the primary files justify a fair score band, stop reading additional evidence.",
  };
}

function representativeSlotsFromRubric({ rubricPriority = {}, mode = "auto", slots = 1 }) {
  const count = clampSlots(slots);
  const configured = Array.isArray(rubricPriority.representativeMediaSlots)
    ? rubricPriority.representativeMediaSlots
    : [];
  if (configured.length) return configured.slice(0, count).map((slot, index) => normalizeSlot(slot, index, mode));
  if (mode === "video-first") {
    return Array.from({ length: count }, (_, index) => ({
      role: `video_${index + 1}`,
      label: `Video ${index + 1}`,
      kinds: ["video_frame"],
      terms: [],
      required: index === 0,
    }));
  }
  return Array.from({ length: count }, (_, index) => ({
    role: `representative_${index + 1}`,
    label: `Representative ${index + 1}`,
    kinds: ["video_frame", "image", "pdf_page", "doc_image"],
    terms: index === 0 ? normalizedTerms(rubricPriority.representativeMediaTerms) : [],
    required: index === 0,
  }));
}

function selectEvidenceForSlot(evidenceItems, slot = {}, options = {}) {
  const used = new Set(options.usedAbsolutePaths || []);
  const indexed = evidenceItems
    .map((item, index) => ({ ...item, index: item.index ?? index }))
    .filter((item) => item.absolutePath && !used.has(item.absolutePath));
  if (indexed.length === 0) return null;
  const slotKinds = new Set(slot.kinds || []);
  let candidates = slotKinds.size ? indexed.filter((item) => slotKinds.has(item.kind)) : indexed;
  if (candidates.length === 0) candidates = indexed;
  const terms = normalizedTerms(slot.terms);
  return candidates
    .map((item) => ({
      item,
      termRank: terms.length ? termRank(item, terms) : 0,
      frameRank: item.frameIndex ?? item.pageIndex ?? 999,
    }))
    .sort((left, right) => (
      left.termRank - right.termRank
      || left.frameRank - right.frameRank
      || (left.item.index ?? 0) - (right.item.index ?? 0)
      || String(left.item.absolutePath).localeCompare(String(right.item.absolutePath))
    ))[0].item;
}

function selectEvidenceForContactSheet({
  evidenceItems = [],
  rubricPriority = {},
  mode = "auto",
  slots = 1,
  explicitPreferTerms = [],
}) {
  const effectiveSlots = representativeSlotsFromRubric({ rubricPriority, mode, slots })
    .map((slot, index) => ({
      ...slot,
      terms: explicitPreferTerms.length && index === 0 ? explicitPreferTerms : slot.terms,
    }));
  const usedAbsolutePaths = new Set();
  return effectiveSlots.map((slot) => {
    const selected = selectEvidenceForSlot(evidenceItems, slot, { usedAbsolutePaths });
    if (selected) usedAbsolutePaths.add(selected.absolutePath);
    return {
      slot,
      item: selected,
      issues: selectionIssues({ selected, slot, mode, evidenceItems }),
    };
  });
}

function isVisualEvidenceItem(item) {
  if (!item) return false;
  if (NON_VISUAL_KINDS.has(item.kind)) return false;
  return IMAGE_EXTENSIONS.has(path.extname(item.absolutePath || item.path || "").toLowerCase());
}

function isDocumentDerivedItem(item) {
  return DOCUMENT_DERIVED_KINDS.has(item?.kind);
}

function selectionIssues({ selected, slot, mode, evidenceItems }) {
  const issues = [];
  if (!selected && slot.required) issues.push("missing_required_media_slot");
  if (mode === "video-first" && !evidenceItems.some((item) => item.kind === "video_frame")) {
    issues.push("video_first_no_video_frame");
  }
  if (mode === "video-first" && selected && selected.kind !== "video_frame") {
    issues.push("non_video_fallback_selected");
  }
  if (isDocumentDerivedItem(selected)) {
    issues.push("document_image_selected", "needs_representative_image_review");
  }
  return Array.from(new Set(issues));
}

function evidencePriority(filePath, rubricPriority = {}, item = {}) {
  const name = path.basename(filePath).toLowerCase();
  if (item.kind === "text_bundle" || name === "review-text.md") return -100;
  if (matchesAnyTerm(name, rubricPriority.representativeMediaTerms)) return -80;
  if (matchesAnyTerm(name, rubricPriority.primaryEvidence)) return -70;
  if (item.kind === "video_frame") return -10;
  if (/(final|render|poster|layout|board|effect|hero|海报|排版|效果|成品|渲染)/u.test(name)) return 0;
  if (/(report|summary|实训报告|报告|总结|说明|(^|[_-])text([._-]|$))/u.test(name)) return 1;
  if (/(slide|ppt|presentation|汇报)/u.test(name)) return 2;
  if (/(source|model|texture|archive|asset|源文件|模型|贴图|归档)/u.test(name)) return 4;
  if (item.kind === "image" || item.kind === "pdf_page") return 3;
  if (item.kind === "doc_image") return 3;
  return 3;
}

function normalizeEvidenceItem(item, evidenceDir, index) {
  const absolutePath = item.absolutePath
    ? path.resolve(item.absolutePath)
    : path.resolve(evidenceDir, item.path || "");
  return {
    ...item,
    path: item.path || path.relative(evidenceDir, absolutePath).replace(/\\/g, "/"),
    absolutePath,
    sourceBasename: item.sourceBasename || path.basename(item.sourceFile || absolutePath),
    index: item.index ?? index,
  };
}

function compatibilityItem({ evidenceDir, relativePath, index, generated, kind = "", sourceKind = "" }) {
  const absolutePath = path.isAbsolute(relativePath) ? relativePath : path.resolve(evidenceDir, relativePath);
  const inferredKind = kind || inferItemKind(absolutePath);
  if (!isVisualKindOrText(inferredKind, absolutePath)) return null;
  return {
    path: path.relative(evidenceDir, absolutePath).replace(/\\/g, "/"),
    absolutePath,
    kind: inferredKind,
    sourceKind: sourceKind || (generated ? "unsupported" : "original_image"),
    sourceFile: absolutePath,
    sourceBasename: path.basename(absolutePath),
    generated,
    index,
  };
}

function filePathItem(filePath, index, generated) {
  return {
    path: filePath,
    absolutePath: path.resolve(filePath),
    kind: inferItemKind(filePath),
    sourceKind: generated ? "unsupported" : "original_image",
    sourceFile: path.resolve(filePath),
    sourceBasename: path.basename(filePath),
    generated,
    index,
  };
}

function inferItemKind(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (base === "review-text.md") return "text_bundle";
  if (/_text\.txt$/i.test(base)) return "doc_text";
  if (/_image_\d+\.(png|jpg|jpeg|webp)$/i.test(base)) return "doc_image";
  return IMAGE_EXTENSIONS.has(path.extname(base)) ? "image" : "unsupported";
}

function isVisualKindOrText(kind, filePath) {
  return kind === "text_bundle" || kind === "doc_text" || IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function normalizeSlot(slot, index, mode = "auto") {
  const schemaWarnings = [];
  const hasLegacyName = slot.name && !slot.role && !slot.label;
  const hasLegacyPriority = Array.isArray(slot.priority) && !Array.isArray(slot.terms);
  if (hasLegacyName) schemaWarnings.push("legacy_name_field");
  if (hasLegacyPriority) schemaWarnings.push("legacy_priority_field");
  const label = slot.label || slot.name || slot.role || `Representative ${index + 1}`;
  const role = slot.role || (slot.name ? slugRole(slot.name) : `representative_${index + 1}`);
  return {
    role,
    label,
    kinds: Array.isArray(slot.kinds) ? slot.kinds : (mode === "video-first" ? ["video_frame"] : []),
    terms: normalizedTerms(Array.isArray(slot.terms) ? slot.terms : slot.priority),
    required: slot.required === true,
    ...(schemaWarnings.length ? { schemaWarnings } : {}),
  };
}

function slugRole(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "representative";
}

function termRank(item, terms) {
  const searchable = normalizeSearchText([
    item.sourceBasename,
    item.sourceFile,
    item.path,
    item.absolutePath,
  ].filter(Boolean).join(" "));
  const index = terms.findIndex((term) => searchable.includes(term));
  return index === -1 ? terms.length + 1 : index;
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

function clampSlots(slots) {
  const parsed = Number(slots);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(15, Math.trunc(parsed)));
}

module.exports = {
  buildEvidenceLoadPlan,
  itemsFromReviewAssets,
  isDocumentDerivedItem,
  isVisualEvidenceItem,
  representativeSlotsFromRubric,
  selectEvidenceForContactSheet,
  selectEvidenceForSlot,
};
