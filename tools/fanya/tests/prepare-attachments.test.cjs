const assert = require("node:assert/strict");
const test = require("node:test");

const {
  prepareAttachments,
} = require("../scripts/prepare-attachments.cjs");

test("prepareAttachments creates actions for documents, videos, archives, and unsupported failures", () => {
  const plan = prepareAttachments({
    workIndex: 4,
    studentIndex: 3,
    student: { name: "学生", id: "123" },
    attachments: [
      {
        type: "doc",
        text: "plan.doc\n12K",
        objectid: "doc1",
        meta: {
          filename: "plan.doc",
          pdf: "https://example.test/plan.pdf",
          download: "https://example.test/plan.doc",
          status: "success",
        },
      },
      {
        type: "mov",
        text: "scene.mov\n20M",
        objectid: "mov1",
        meta: {
          filename: "scene.mov",
          screenshot: "https://example.test/scene.jpg",
          download: "https://example.test/scene.mov",
          duration: 30,
          status: "success",
        },
      },
      {
        type: "zip",
        text: "source.zip\n2M",
        objectid: "zip1",
        meta: {
          filename: "source.zip",
          download: "https://example.test/source.zip",
          status: "success",
        },
      },
      {
        type: "mp4",
        text: "broken.mp4",
        objectid: "bad1",
        meta: {
          error: "Forbidden",
        },
      },
    ],
  });

  assert.equal(plan.tmpDir, "tmp/work-4/student-3");
  assert.equal(plan.attachments.length, 4);
  assert.equal(plan.attachments[0].kind, "document");
  assert.deepEqual(plan.attachments[0].actions, ["download_for_rendering"]);
  assert.equal(plan.attachments[1].kind, "video");
  assert.deepEqual(plan.attachments[1].actions, ["download_for_sampling"]);
  assert.equal(plan.attachments[2].kind, "archive");
  assert.deepEqual(plan.attachments[2].actions, ["download_for_extraction"]);
  assert.equal(plan.attachments[3].kind, "video");
  assert.deepEqual(plan.attachments[3].actions, ["mark_manual_review"]);
  assert.equal(plan.manualReview.length, 1);
});
