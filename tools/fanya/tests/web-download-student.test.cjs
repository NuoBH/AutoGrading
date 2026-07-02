const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { prepareWebStudentDownload } = require("../scripts/web-download-student.cjs");

test("prepareWebStudentDownload builds manifest for current web student", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-web-download-"));
  const statePath = path.join(root, "state.json");
  const attachmentsPath = path.join(root, "attachments.json");
  const manifestPath = path.join(root, "manifest.json");
  fs.writeFileSync(statePath, JSON.stringify({
    reviewMode: "web_download",
    currentStudentKey: "20230001",
    student: { studentName: "Student A", studentKey: "20230001" },
    studentOrdinal: 1,
    studentDir: path.join(root, "tmp", "work-7", "student-1"),
    webReviewUrl: "https://example.test/review?studentId=20230001",
  }));
  fs.writeFileSync(attachmentsPath, JSON.stringify({
    student: { name: "Student A", id: "20230001" },
    attachments: [
      {
        objectid: "object-1",
        type: "mp4",
        text: "demo.mp4",
        meta: { filename: "demo.mp4", download: "https://example.test/demo.mp4" },
      },
    ],
  }));

  const result = prepareWebStudentDownload({ statePath, attachmentsPath, manifestPath });

  assert.equal(result.tmpDir, path.join(root, "tmp", "work-7", "student-1"));
  assert.equal(result.student.studentKey, "20230001");
  assert.equal(result.attachments[0].kind, "video");
  assert.equal(result.webReviewUrl, "https://example.test/review?studentId=20230001");
  assert.equal(fs.existsSync(manifestPath), true);
});

test("prepareWebStudentDownload rejects bundle mode", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-web-download-"));
  const statePath = path.join(root, "state.json");
  const attachmentsPath = path.join(root, "attachments.json");
  fs.writeFileSync(statePath, JSON.stringify({ reviewMode: "bundle_zip" }));
  fs.writeFileSync(attachmentsPath, JSON.stringify({ attachments: [] }));

  assert.throws(
    () => prepareWebStudentDownload({ statePath, attachmentsPath }),
    /web_download/
  );
});
