const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  itemsFromReviewAssets,
  representativeSlotsFromRubric,
  selectEvidenceForSlot,
} = require("../scripts/evidence-selector.cjs");

test("selectEvidence prioritizes rubric slot kind before filename terms", () => {
  const items = [
    { absolutePath: "student/planning-final.png", kind: "image", sourceKind: "original_image", sourceBasename: "planning-final.png" },
    { absolutePath: "student/evidence/final_01.png", kind: "video_frame", sourceKind: "video", sourceBasename: "final-video.mp4" },
  ];

  const selected = selectEvidenceForSlot(items, {
    role: "primary_video",
    kinds: ["video_frame"],
    terms: ["final"],
  });

  assert.equal(path.basename(selected.absolutePath), "final_01.png");
});

test("selectEvidence preserves review priority order when no slot terms match", () => {
  const items = [
    { absolutePath: "student/evidence/a_01.png", kind: "video_frame", sourceKind: "video", sourceBasename: "a.mp4" },
    { absolutePath: "student/evidence/b_01.png", kind: "video_frame", sourceKind: "video", sourceBasename: "b.mp4" },
  ];

  const selected = selectEvidenceForSlot(items, { kinds: ["video_frame"], terms: ["missing"] });

  assert.equal(path.basename(selected.absolutePath), "a_01.png");
});

test("representativeSlotsFromRubric normalizes legacy name and priority fields", () => {
  const slots = representativeSlotsFromRubric({
    rubricPriority: {
      representativeMediaSlots: [
        { name: "Final Video", priority: ["final", "finished"], required: true },
      ],
    },
    mode: "video-first",
    slots: 1,
  });

  assert.equal(slots[0].role, "final_video");
  assert.equal(slots[0].label, "Final Video");
  assert.deepEqual(slots[0].kinds, ["video_frame"]);
  assert.deepEqual(slots[0].terms, ["final", "finished"]);
  assert.equal(slots[0].required, true);
  assert.deepEqual(slots[0].schemaWarnings, ["legacy_name_field", "legacy_priority_field"]);
});

test("representativeSlotsFromRubric allows up to fifteen generated slots", () => {
  const slots = representativeSlotsFromRubric({
    rubricPriority: {},
    mode: "video-first",
    slots: 15,
  });

  assert.equal(slots.length, 15);
  assert.equal(slots[14].role, "video_15");
});

test("itemsFromReviewAssets keeps compatibility with old generatedEvidence records", () => {
  const evidenceDir = path.join("tmp", "student", "evidence");
  const items = itemsFromReviewAssets({
    evidenceDir,
    reviewAssets: {
      evidenceComplete: true,
      externalViewable: ["../final.png"],
      generatedEvidence: ["clip_01.png"],
      reviewText: "review-text.md",
    },
  });

  assert.equal(items.length, 3);
  assert.equal(items[0].kind, "image");
  assert.equal(items[1].kind, "image");
  assert.equal(items[2].kind, "text_bundle");
});
