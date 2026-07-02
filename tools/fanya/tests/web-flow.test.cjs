const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { downloadJob, buildDownloadJobs } = require("../scripts/download-attachments.cjs");
const { currentReviewState } = require("../scripts/current-review-state.cjs");
const { prepareEvidence } = require("../scripts/prepare-evidence.cjs");
const { recordReview } = require("../scripts/record-review.cjs");
const { createResultRecordFile, createRubricRecordFile } = require("../scripts/record-store.cjs");
const { resumeTask } = require("../scripts/resume-task.cjs");
const { initSession, loadSession } = require("../scripts/task-session.cjs");
const { prepareWebStudentDownload } = require("../scripts/web-download-student.cjs");
const { parseRosterRows, saveRosterStudentIndex } = require("../scripts/web-roster.cjs");

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

function listenWithPayload(payload) {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "image/png" });
    response.end(payload);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}/poster.png` });
    });
  });
}

test("web pseudo full flow builds roster index, downloads attachment, prepares evidence, records review, and completes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-web-flow-"));
  const assignmentName = "Web Assignment";
  const resultPath = createResultRecordFile({
    resultPath: path.join(root, "result.cjs"),
    courseName: "Web Course",
    assignmentName,
  });
  const rubricPath = createRubricRecordFile({
    rubricPath: path.join(root, "rubric.cjs"),
    courseName: "Web Course",
    assignmentName,
    status: "confirmed",
  });
  const sessionPath = path.join(root, "tmp", "session", "fanya-current-task.json");
  const studentIndexPath = path.join(root, "tmp", "session", "fanya-current-student-index.json");
  const studentsDir = path.join(root, "tmp", "web-students");
  const studentDir = path.join(studentsDir, "20230001-Example Student");
  fs.mkdirSync(studentDir, { recursive: true });

  const rows = [{
    text: "20230001 Example Student To be reviewed",
    cells: ["20230001", "Example Student", "To be reviewed"],
    links: [{ text: "Review", data: "https://example.test/review-work?workAnswerId=20230001", href: "", className: "cz_py" }],
  }];
  const parsed = parseRosterRows(rows);
  assert.equal(parsed[0].status, "pending");
  assert.equal(parsed[0].reviewUrl.includes("review-work"), true);
  saveRosterStudentIndex({
    indexPath: studentIndexPath,
    courseName: "Web Course",
    assignmentName,
    rows,
  });

  initSession({
    sessionPath,
    courseName: "Web Course",
    assignmentName,
    localWorkIndex: 1,
    reviewMode: "web_download",
    status: "reviewing_students",
    rubricPath,
    resultPath,
    reviewSourcePath: path.join(root, "tmp", "web-work"),
    studentIndexPath,
    studentsDir,
    currentStudentKey: "20230001",
    completedStudentKeys: [],
    skippedStudentKeys: [],
  });

  const firstResume = resumeTask({ sessionPath, cwd: root });
  assert.equal(firstResume.status, "resume_ready");
  assert.equal(firstResume.currentReviewState.needsBrowserReviewPage, true);

  const { server, url } = await listenWithPayload(PNG_BYTES);
  try {
    const statePath = path.join(root, "tmp", "session", "current-review-state.json");
    const attachmentsPath = path.join(studentDir, "extracted-attachments.json");
    const manifestPath = path.join(studentDir, "prepared-attachments.json");
    fs.writeFileSync(statePath, `${JSON.stringify(currentReviewState({ sessionPath }), null, 2)}\n`, "utf8");
    fs.writeFileSync(attachmentsPath, `${JSON.stringify({
      student: { name: "Example Student", id: "20230001" },
      attachments: [{
        objectid: "image-1",
        type: "png",
        text: "poster.png",
        meta: { filename: "poster.png", download: url },
      }],
    }, null, 2)}\n`, "utf8");

    const manifest = prepareWebStudentDownload({ statePath, attachmentsPath, manifestPath });
    assert.equal(manifest.attachments[0].kind, "image");

    const jobs = buildDownloadJobs(manifest);
    const downloaded = await downloadJob(jobs[0], { headers: {} });
    assert.equal(downloaded.status, "downloaded");
    assert.equal(fs.existsSync(downloaded.targetPath), true);

    const evidence = prepareEvidence(studentDir, { tools: {} });
    assert.equal(evidence.evidenceComplete, true);
    assert.equal(evidence.externalViewable.length, 1);

    const record = recordReview({
      sessionPath,
      review: {
        studentName: "Example Student",
        studentKey: "20230001",
        status: "reviewed",
        submissionSummary: "image",
        suggestedScore: 85,
        comment: "Complete test submission.",
      },
    });
    assert.equal(record.appended, true);
    assert.equal(record.nextStudentKey, null);
    assert.equal(loadSession(sessionPath).completedStudentKeys.includes("20230001"), true);
    assert.equal(resumeTask({ sessionPath, cwd: root }).status, "complete");
  } finally {
    server.close();
  }
});
