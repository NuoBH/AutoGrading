# 02 Assignment Rubric

Goal: read the assignment requirements, create or reuse a structured rubric record, and pause for user confirmation before reviewing students.

## Wizard Gate

Before student review, `start-review-wizard.cjs status` must see a confirmed rubric record. If it returns `needs_rubric` or `needs_rubric_confirmation`, stop at this file's rubric flow and show the rubric to the user for confirmation.

## Existing Rubric Check

At the start of each assignment, ask whether an existing rubric `.cjs` applies.

If yes, record its path in the session and result record.

If no, open the assignment review page and read the assignment description before creating:

```text
rubrics/<course>/<assignment>-rubric.cjs
```

## Reading Assignment Description

The assignment list usually shows only summary fields. The full assignment description is often visible after entering one student's review detail page.

Allowed read-only path:

1. Open the assignment list.
2. Enter the assignment's review list.
3. Open one submitted student's review detail page as a read-only anchor.
4. Read assignment title, total score, full prompt, submission requirements, attachment requirements, and visible submission structure.
5. Do not evaluate that student yet.

When inside a read-only student review detail page, run `tools/fanya/browser/assignment-description.browser.js` to extract `title`, `totalScore`, `descriptionText`, and visible attachment hints. Use this output to draft the rubric, then stop for user confirmation.

Do not click submit, return, save, export scores, or fill any score field.

## Rubric Record Shape

Create a structured object:

```js
module.exports = {
  schemaVersion: 1,
  kind: "fanya_rubric",
  courseName: "...",
  assignmentName: "...",
  status: "confirmed",
  assignmentSummary: "...",
  dimensions: [
    { name: "完成度", points: 20, criteria: "..." }
  ],
  scoreBands: [
    { range: "90-100", meaning: "特别优秀" },
    { range: "80-89", meaning: "普通到良好" },
    { range: "70-79", meaning: "中等或较大问题" },
    { range: "0-69", meaning: "大问题或敷衍" }
  ]
};
```

Rubric dimensions should be derived from the assignment description and the user's global score-band rules.

For new rubrics, add `reviewPriority` and show it to the user during rubric confirmation. If the user has told you which evidence matters most, use that. Otherwise infer it from the assignment description and visible deliverable types, then tell the user what you inferred.

```js
reviewPriority: {
  recommendedMode: "fast_bundle",
  suitableFor: ["visual", "video", "pdf", "image", "mixed_doc_visual", "text_document"],
  primaryEvidence: [
    "Use assignment-specific deliverables from the confirmed rubric first.",
    "For visual submissions, inspect representative final images, layout boards, posters, PDF previews, or video frames.",
    "For document-heavy submissions, read evidence/review-text.md before opening lower-priority files."
  ],
  secondaryEvidence: [
    "Open source archives, full slide decks, textures, or extra support files only when the score band is unclear."
  ],
  representativeMediaRules: {
    videoFrameCount: 3,
    pdfMaxPages: 3
  },
  representativeMediaTerms: [],
  commentRule: "Write personalized, specific 2-3 sentence comments by default.",
  stopRule: "Stop reading lower-priority evidence once the inspected files justify a fair score band.",
  fallbackRule: "Inspect more evidence for possible 90+ scores, low scores, blank/abnormal evidence, missing required deliverables, or conflicting evidence."
}
```

Bundle mode defaults to `fast_bundle` when the rubric recommends it. If the user asks for one-by-one full review, still inspect high-priority evidence first and stop once a fair score band is justified. Do not assume every assignment has PPT, reports, layout boards, or images; the priority list must follow the actual assignment deliverables.

`representativeMediaTerms` is assignment-specific. Fill it from the assignment requirements or user instructions when useful. Do not paste the system fallback default representative terms into every rubric.

## Confirmation

After creating the rubric, show the rubric path and a concise summary of dimensions to the user. Start student review only after the user confirms.
