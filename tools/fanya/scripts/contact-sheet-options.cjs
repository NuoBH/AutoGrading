const MAX_CONTACT_SHEET_SLOTS = 15;

function contactSheetOptionsFromRubric(rubric = {}) {
  const reviewPriority = rubric.reviewPriority || {};
  const representativeMediaSlots = Array.isArray(reviewPriority.representativeMediaSlots)
    ? reviewPriority.representativeMediaSlots
    : [];
  const videoSlots = representativeMediaSlots.filter((slot) => (
    Array.isArray(slot.kinds) && slot.kinds.includes("video_frame")
  ));
  if (videoSlots.length) {
    return { mode: "video-first", slots: clampSlots(representativeMediaSlots.length) };
  }

  const suitableFor = Array.isArray(reviewPriority.suitableFor)
    ? reviewPriority.suitableFor.map((item) => String(item).toLowerCase())
    : [];
  const videoFrameCount = Number.parseInt(reviewPriority.representativeMediaRules?.videoFrameCount, 10);
  if (suitableFor.some((item) => item.includes("video")) && videoFrameCount > 1) {
    return { mode: "video-first", slots: clampSlots(videoFrameCount) };
  }

  return { mode: "auto", slots: 1 };
}

function contactSheetOptionArgs(options = {}) {
  if (!options || options.mode === "auto" && Number(options.slots) === 1) return "";
  return `--mode ${options.mode || "auto"} --slots ${clampSlots(options.slots)}`;
}

function clampSlots(slots) {
  const parsed = Number(slots);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(MAX_CONTACT_SHEET_SLOTS, Math.trunc(parsed)));
}

module.exports = {
  MAX_CONTACT_SHEET_SLOTS,
  clampSlots,
  contactSheetOptionArgs,
  contactSheetOptionsFromRubric,
};
