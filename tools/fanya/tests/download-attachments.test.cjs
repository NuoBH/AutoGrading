const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildDownloadJobs,
  selectDownloadUrl,
  targetFilename,
} = require("../scripts/download-attachments.cjs");

test("selectDownloadUrl prefers fallback links before preview links", () => {
  assert.equal(
    selectDownloadUrl({
      primaryUrl: "https://example.test/screenshot.png",
      previewUrl: "https://example.test/video.mp4",
      fallbackUrl: "https://example.test/download/video.mov",
    }),
    "https://example.test/download/video.mov",
  );
});

test("targetFilename keeps stable order and sanitizes Windows path chars", () => {
  assert.equal(targetFilename({ filename: "作品集:final.mov" }, 2), "03-作品集-final.mov");
});

test("buildDownloadJobs marks failed or missing attachments for manual review", () => {
  const jobs = buildDownloadJobs({
    tmpDir: "tmp/work-4/student-3",
    attachments: [
      {
        kind: "archive",
        filename: "source.zip",
        fallbackUrl: "https://example.test/source.zip",
        actions: ["download_for_extraction"],
      },
      {
        kind: "document",
        filename: "broken.doc",
        actions: ["mark_manual_review"],
      },
    ],
  });

  assert.equal(jobs[0].status, "pending");
  assert.equal(jobs[0].targetPath, "tmp\\work-4\\student-3\\01-source.zip");
  assert.equal(jobs[1].status, "manual_review");
});
