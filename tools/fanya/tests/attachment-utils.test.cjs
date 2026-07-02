const assert = require("node:assert/strict");
const test = require("node:test");

const {
  sanitizePathPart,
  buildStudentTmpDir,
  summarizeAttachment,
} = require("../scripts/attachment-utils.cjs");

test("sanitizePathPart replaces Windows-invalid filename characters", () => {
  assert.equal(
    sanitizePathPart('Assignment A：Visual Review/测试*?"<>|'),
    "Assignment A-Visual Review-测试------",
  );
});

test("buildStudentTmpDir keeps files grouped by work then student", () => {
  assert.equal(
    buildStudentTmpDir({ workIndex: 4, studentIndex: 2 }),
    "tmp/work-4/student-2",
  );
});

test("summarizeAttachment prefers pdf for documents", () => {
  const summary = summarizeAttachment({
    text: "layout.docx\n10K",
    type: "docx",
    objectid: "abc",
    meta: {
      filename: "layout.docx",
      pdf: "https://example.test/layout.pdf",
      download: "https://example.test/layout.docx",
      length: 10240,
      status: "success",
    },
  });

  assert.equal(summary.kind, "document");
  assert.equal(summary.primaryUrl, "https://example.test/layout.pdf");
  assert.equal(summary.fallbackUrl, "https://example.test/layout.docx");
});

test("summarizeAttachment prefers screenshot and preserves download for videos", () => {
  const summary = summarizeAttachment({
    text: "movie.mp4\n20M",
    type: "mp4",
    objectid: "def",
    meta: {
      filename: "movie.mp4",
      screenshot: "https://example.test/snapshot.jpg",
      http: "https://example.test/movie.mp4",
      download: "https://example.test/download/movie.mp4",
      duration: 70,
      length: 20000000,
      status: "success",
    },
  });

  assert.equal(summary.kind, "video");
  assert.equal(summary.primaryUrl, "https://example.test/snapshot.jpg");
  assert.equal(summary.previewUrl, "https://example.test/movie.mp4");
  assert.equal(summary.fallbackUrl, "https://example.test/download/movie.mp4");
  assert.equal(summary.durationSeconds, 70);
});
