const INVALID_PATH_CHARS = /[<>:"/\\|?*：]/g;

function sanitizePathPart(value) {
  return String(value ?? "")
    .trim()
    .replace(INVALID_PATH_CHARS, "-")
    .replace(/\s+/g, " ")
    || "untitled";
}

function buildStudentTmpDir({ workIndex, studentIndex }) {
  return `tmp/work-${workIndex}/student-${studentIndex}`;
}

function inferKind(type, filename) {
  const value = `${type ?? ""} ${filename ?? ""}`.toLowerCase();
  if (/\b(mp4|mov|mkv|avi|wmv|flv|webm)\b/.test(value)) return "video";
  if (/\b(doc|docx|pdf|ppt|pptx|xls|xlsx|txt)\b/.test(value)) return "document";
  if (/\b(jpg|jpeg|png|gif|webp|bmp)\b/.test(value)) return "image";
  if (/\b(zip|rar|7z|tar|gz)\b/.test(value)) return "archive";
  return "other";
}

function summarizeAttachment(attachment) {
  const meta = attachment.meta ?? {};
  const filename = meta.filename || firstLine(attachment.text) || "attachment";
  const kind = inferKind(attachment.type, filename);

  if (kind === "document") {
    return baseSummary(attachment, meta, filename, kind, {
      primaryUrl: meta.pdf || meta.http || meta.download || "",
      fallbackUrl: meta.download || meta.http || "",
    });
  }

  if (kind === "video") {
    return baseSummary(attachment, meta, filename, kind, {
      primaryUrl: meta.screenshot || "",
      previewUrl: meta.http || "",
      fallbackUrl: meta.download || meta.http || "",
      durationSeconds: meta.duration ?? null,
    });
  }

  return baseSummary(attachment, meta, filename, kind, {
    primaryUrl: meta.http || meta.download || meta.screenshot || "",
    fallbackUrl: meta.download || meta.http || "",
  });
}

function baseSummary(attachment, meta, filename, kind, extra) {
  return {
    objectid: attachment.objectid || meta.objectid || "",
    filename,
    type: attachment.type || "",
    kind,
    length: meta.length ?? null,
    status: meta.status || "",
    ...extra,
  };
}

function firstLine(text) {
  return String(text ?? "").split(/\r?\n/).map((line) => line.trim()).find(Boolean);
}

module.exports = {
  sanitizePathPart,
  buildStudentTmpDir,
  inferKind,
  summarizeAttachment,
};
