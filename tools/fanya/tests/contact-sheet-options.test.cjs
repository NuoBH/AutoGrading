const assert = require("node:assert/strict");
const test = require("node:test");

const {
  contactSheetOptionsFromRubric,
} = require("../scripts/contact-sheet-options.cjs");

test("contactSheetOptionsFromRubric derives video-first slots from videoFrameCount", () => {
  const options = contactSheetOptionsFromRubric({
    reviewPriority: {
      representativeMediaRules: { videoFrameCount: 6 },
      suitableFor: ["video"],
    },
  });

  assert.deepEqual(options, { mode: "video-first", slots: 6 });
});

test("contactSheetOptionsFromRubric prefers representativeMediaSlots length", () => {
  const options = contactSheetOptionsFromRubric({
    reviewPriority: {
      representativeMediaRules: { videoFrameCount: 6 },
      representativeMediaSlots: [
        { role: "primary_video", kinds: ["video_frame"] },
        { role: "secondary_video", kinds: ["video_frame"] },
      ],
    },
  });

  assert.deepEqual(options, { mode: "video-first", slots: 2 });
});

test("contactSheetOptionsFromRubric keeps auto mode for non-video rubrics", () => {
  const options = contactSheetOptionsFromRubric({
    reviewPriority: {
      representativeMediaRules: { videoFrameCount: 12 },
      suitableFor: ["image"],
    },
  });

  assert.deepEqual(options, { mode: "auto", slots: 1 });
});
