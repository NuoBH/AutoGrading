const { buildStudentTmpDir, summarizeAttachment } = require("./attachment-utils.cjs");

function prepareAttachments({ workIndex, studentIndex, student, attachments }) {
  const tmpDir = buildStudentTmpDir({ workIndex, studentIndex });
  const prepared = (attachments ?? []).map((attachment, index) => {
    const summary = summarizeAttachment(attachment);
    const actions = chooseActions(summary, attachment.meta);
    return {
      index,
      ...summary,
      actions,
    };
  });

  return {
    student: student ?? null,
    tmpDir,
    attachments: prepared,
    manualReview: prepared.filter((attachment) => attachment.actions.includes("mark_manual_review")),
  };
}

function chooseActions(summary, meta = {}) {
  if (meta.error || meta.status === "failed" || meta.status === "error") {
    return ["mark_manual_review"];
  }

  if (summary.kind === "document") {
    const actions = [];
    if (summary.fallbackUrl || summary.primaryUrl) actions.push("download_for_rendering");
    return actions.length ? actions : ["mark_manual_review"];
  }

  if (summary.kind === "video") {
    const actions = [];
    if (summary.fallbackUrl || summary.previewUrl) actions.push("download_for_sampling");
    return actions.length ? actions : ["mark_manual_review"];
  }

  if (summary.kind === "image") {
    return summary.fallbackUrl || summary.primaryUrl
      ? ["download_for_viewing"]
      : ["mark_manual_review"];
  }

  if (summary.kind === "archive") {
    return summary.fallbackUrl ? ["download_for_extraction"] : ["mark_manual_review"];
  }

  return summary.fallbackUrl || summary.primaryUrl
    ? ["download_for_manual_review"]
    : ["mark_manual_review"];
}

module.exports = {
  prepareAttachments,
  chooseActions,
};
