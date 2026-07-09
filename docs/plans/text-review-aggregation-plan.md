# Text Review Aggregation Plan

## Goal

Optimize Fanya / Chaoxing assignment review when submissions include meaningful text, whether the assignment is pure text/document or mixed visual + document.

The new workflow should let the agent read one assignment-level text bundle first, instead of opening every student's `review-text.md` one by one. It must still preserve the current safety gates:

- rubric must be confirmed before review;
- student index must be real, not sample/placeholder;
- skipped/already-reviewed students must remain separate;
- first-pass bulk review writes drafts, not final reviews;
- user confirmation is required before promotion to final reviews;
- students with insufficient text or ambiguous evidence must still be reviewed with their own files.

## Current Behavior

### Evidence Preparation

Current evidence preparation is per student:

```text
<student-dir>/evidence/review-assets.json
<student-dir>/evidence/review-text.md
<student-dir>/evidence/*generated images/text*
```

The relevant code paths are:

- `tools/fanya/scripts/prepare-evidence.cjs`
- `tools/fanya/scripts/prepare-bundle-evidence.cjs`
- `tools/fanya/scripts/office-evidence.cjs`
- `tools/fanya/scripts/evidence-selector.cjs`
- `tools/fanya/scripts/current-review-state.cjs`

### Text Files

For each student, `prepare-evidence.cjs` may generate:

```text
<student-dir>/evidence/review-text.md
```

This file is a cleaned, truncated text bundle for that student only.

It currently includes:

- plain text files such as `.txt`, `.md`, `.markdown`, `.text`;
- extracted `_text.txt` generated from `.docx`;
- extracted `_text.txt` generated from `.pptx`.

Important limits:

- per student text bundle max: `MAX_REVIEW_TEXT_CHARS = 12000`;
- per source file max: `MAX_TEXT_PER_FILE_CHARS = 3000`;
- if the bundle is incomplete, garbled, truncated, or insufficient, the reviewer must open original evidence.

### Office Documents

For `.docx` and `.pptx`, `office-evidence.cjs` currently:

- extracts text from OOXML XML into `<base>_text.txt`;
- extracts embedded media into `<base>_image_XX.<ext>`;
- marks the file for manual review if no text or media can be extracted.

So for Word/PPT submissions, both text review and contact sheet selection can benefit:

- text goes into per-student `review-text.md`;
- embedded images become `doc_image` evidence items and may appear in contact sheets if relevant.

### PDF Files

PDF handling currently renders pages as images:

```text
<base>_01.png
<base>_02.png
<base>_03.png
```

This is done through Poppler `pdftoppm`.

Current PDF behavior:

- renders up to `MAX_PDF_PAGES = 3`;
- creates `pdf_page` evidence items;
- does not extract selectable text;
- does not run OCR;
- therefore PDF text is not included in `review-text.md` unless it also appears in another extracted text source.

For PDF-heavy assignments, the current best path is visual inspection through generated PDF page images or contact sheet, not text aggregation. This should be improved by adding Poppler `pdftotext` as the first PDF text extraction path.

## Proposed Optimization

Add an assignment-level text aggregation step that reads each student's existing per-student `review-text.md` and combines them into one review file.

Proposed output:

```text
tmp/session/assignment-review-text.md
tmp/session/assignment-review-text-index.json
```

Alternative output when a work directory is known:

```text
<work-dir>/assignment-review-text.md
<work-dir>/assignment-review-text-index.json
```

These files are temporary/private review artifacts and must stay under ignored directories such as `tmp/`.

Add PDF selectable-text extraction before building the assignment-level text bundle:

```text
PDF -> pdftotext when available -> <pdf-base>_text.txt -> per-student review-text.md -> assignment-review-text.md
```

This should run before OCR and before any full original-PDF reading by the agent. Page rendering should still be available for visual/layout review.

## Why This Helps

For text-heavy or mixed document assignments, per-student review currently causes repeated file opening:

```text
student A/evidence/review-text.md
student B/evidence/review-text.md
student C/evidence/review-text.md
...
```

An assignment-level text bundle lets the agent:

- read all available student text in one pass;
- compare writing quality and completeness across students;
- detect repeated missing sections;
- draft scores/comments more consistently;
- reduce token/time overhead from repeated navigation and file reads.

This is especially useful for:

- pure text submissions;
- report-heavy assignments;
- reflection / process documentation;
- mixed visual + report assignments where text contributes to scoring.

It should not replace visual contact sheet review when the core deliverable is visual/video/PDF page appearance.

## New Script

Add:

```text
tools/fanya/scripts/build-assignment-review-text.cjs
```

Suggested CLI:

```powershell
node tools/fanya/scripts/build-assignment-review-text.cjs `
  --session-path "tmp/session/fanya-current-task.json" `
  --student-index "tmp/session/fanya-current-student-index.json" `
  --out "tmp/session/assignment-review-text.md" `
  --index-out "tmp/session/assignment-review-text-index.json"
```

Optional arguments:

```text
--include-completed        include already reviewed students, default false
--include-skipped          include skipped students, default false
--max-students <n>         optional cap for test/debug
--max-chars-per-student    default 2500-4000
--max-total-chars          default around 80000-120000
--only-with-review-text    default true
--summary-only             stdout prints counts only
```

## Assignment-Level Text Format

Suggested `assignment-review-text.md`:

```md
# Assignment Review Text Bundle

Course: <courseName>
Assignment: <assignmentName>
Generated: <timestamp>

This file combines per-student review-text.md files for first-pass text review.
Use it for draft review only. Open original evidence when text is missing,
truncated, garbled, or the score band is unclear.

## Review Summary

- Students in index: 40
- Included text bundles: 34
- Missing text bundles: 4
- Skipped/already handled excluded: 2
- Truncated sections: 8

## Student 1 / 40

Student key: 20240001
Student name: <studentName>
Student dir: <relative path>
Review text path: <relative path>/evidence/review-text.md
Evidence complete: true
Text bundle strategy: priority_text_sources_truncated

### Text

<truncated student review text>

---
```

Notes:

- The file may contain real student information, so keep it under `tmp/`.
- Use exact `studentKey` and `studentName` from the real student index.
- Do not write this aggregate file into `docs/`, `README`, tests, or public examples.

## Index JSON Format

Suggested `assignment-review-text-index.json`:

```json
{
  "schemaVersion": 1,
  "courseName": "...",
  "assignmentName": "...",
  "source": "assignment_review_text",
  "generatedAt": "...",
  "studentCount": 40,
  "includedCount": 34,
  "missingTextCount": 4,
  "truncatedCount": 8,
  "students": [
    {
      "studentKey": "20240001",
      "studentName": "...",
      "studentDir": "...",
      "reviewTextPath": "...",
      "reviewAssetsPath": "...",
      "included": true,
      "textChars": 2500,
      "truncated": true,
      "evidenceComplete": true,
      "textBundleComplete": true,
      "textBundleStrategy": "priority_text_sources_truncated",
      "needsOriginalEvidence": false,
      "reason": ""
    }
  ]
}
```

This index lets future scripts or agents know which students were included and which still need individual evidence review.

## Workflow Integration

### Bundle Zip Mode

Add the new text aggregation path after evidence preparation:

```text
import bundle
-> prepare-bundle-evidence
-> if assignment contains meaningful text:
     build-assignment-review-text
     agent reads assignment-review-text.md
     write draftReviews for students with sufficient text
     inspect missing/ambiguous students individually
     promote drafts after user confirmation
-> if assignment contains visual evidence:
     create contact sheet as current workflow does
```

This should complement the existing contact sheet flow:

- visual/video/image/PDF-page evidence -> contact sheet first-pass calibration;
- text-heavy evidence -> assignment-level text bundle first-pass calibration;
- mixed visual + text assignments -> use both, according to rubric priority.

### Web Download Mode

Web mode downloads/prepares evidence one student at a time, so assignment-level text aggregation is less naturally useful until enough students have been downloaded.

Recommended first version:

- do not make it a required web-mode step;
- allow it only after several or all web students have prepared evidence;
- output should still read from the student index and existing local evidence folders;
- do not trigger browser downloads itself.

### Resume / Repair

The aggregate text file is derived from existing per-student evidence, so it should be treated like contact sheet artifacts:

- it is not the source of truth;
- it can be regenerated after resume;
- bundle repair that rebuilds extracted folders makes old aggregate text stale;
- resume should not block if `assignment-review-text.md` is missing;
- wizard/resume can suggest regenerating it when text-heavy evidence exists.

## Rubric Integration

Extend `rubric.reviewPriority` with optional fields:

```js
reviewPriority: {
  recommendedMode: "fast_bundle",
  suitableFor: ["text_document", "mixed_doc_visual"],
  primaryEvidence: ["review-text.md", "report", "reflection"],
  textReview: {
    useAssignmentTextBundle: true,
    maxCharsPerStudent: 3000,
    maxTotalChars: 100000,
    requireOriginalForHighScores: true,
    requireOriginalForLowScores: true
  }
}
```

Rules:

- If `useAssignmentTextBundle` is true, wizard/resume may suggest `build-assignment-review-text.cjs`.
- If the rubric says visual evidence is primary, do not replace contact sheet with text aggregation.
- If the rubric says text evidence is primary, use assignment-level text bundle before per-student file opening.
- For mixed assignments, use both when each evidence type contributes materially to the score.

## PDF Text Options

### Current PDF Reality

Current PDF handling renders PDF pages into images. This is useful for:

- design boards;
- visual reports;
- presentation PDFs;
- layout-heavy submissions;
- scanned or image-heavy documents.

It does not produce text for `review-text.md`.

### Recommended PDF Strategy: Text-First When Possible, Visual When Needed

Add Poppler `pdftotext` support and use it before relying on rendered PDF page images for text-heavy review.

Recommended default behavior:

1. If `pdftotext` is available, extract selectable PDF text to:

   ```text
   <student-dir>/evidence/<pdf-base>_text.txt
   ```

2. Include extracted PDF text in the student's `review-text.md`.

3. Include the student's `review-text.md` in `assignment-review-text.md`.

4. Render PDF pages to images only when visual/page evidence is needed.

However, "only render PDF images when the PDF contains images" is not quite enough. A PDF may have selectable text but still need page rendering because:

- layout, typography, charts, tables, and poster composition matter;
- design boards and visual reports may contain both text and important visual arrangement;
- PDF image detection can miss vector graphics, diagrams, tables, and layout quality;
- the rubric may require visual presentation, not just written content.

Better rule:

```text
Use pdftotext first for text evidence.
Render PDF pages when the rubric or file context suggests visual/layout evidence matters,
or when text extraction is empty/poor/truncated,
or when the score band is unclear.
```

This keeps text-heavy review efficient without weakening visual/design review.

### Option A: Keep PDF Visual-First For Visual PDFs

For PDFs that are mostly visual, keep current behavior:

- render pages as images;
- include `pdf_page` evidence in contact sheets;
- inspect original PDF/page images for ambiguous cases.

This is best for design/art/media assignments where layout and visual quality matter.

### Option B: Add Selectable PDF Text Extraction With `pdftotext`

Add PDF text extraction with Poppler `pdftotext`.

Potential output:

```text
<student-dir>/evidence/<pdf-base>_text.txt
```

Then include that `_text.txt` in `review-text.md`.

Pros:

- useful for text-based PDFs and reports;
- reduces need to read rendered page images;
- improves assignment-level text aggregation.

Cons:

- requires an additional tool or library;
- extraction quality varies by PDF;
- scanned PDFs still need OCR.

Recommended: make `pdftotext` the first PDF text path. It should be optional at runtime, but strongly recommended in setup because it materially improves text-heavy and mixed document workflows.

### Option C: OCR PDF Page Images

OCR rendered pages with Tesseract or another OCR engine.

Pros:

- works for scanned PDFs and image-only text.

Cons:

- new dependency;
- slower;
- lower accuracy for mixed Chinese/English layouts;
- may add installation friction.

Recommended: not first version. Treat OCR as a later optional enhancement.

## Contact Sheet For PDF / Document Images

Current contact sheet can already use visual evidence items:

- `image`
- `video_frame`
- `pdf_page`
- `doc_image`

This means:

- PDF pages are good contact sheet candidates when the PDF is visual or layout-heavy;
- images extracted from docx/pptx can appear in contact sheets;
- document-derived images are flagged by selection notes as needing representative-image review.

For mixed text + image/PDF assignments:

1. Use contact sheet to compare visual/page evidence.
2. Use assignment-level text bundle to compare text/report evidence.
3. For ambiguous students, open original per-student evidence.

## Proposed Agent Review Flow

### Text-Heavy Assignment

```text
prepare-bundle-evidence
-> build-assignment-review-text
-> agent reads assignment-review-text.md
-> agent writes draftReviews for included students
-> agent reviews missing/truncated/ambiguous students individually
-> promote dry-run
-> user confirms
-> promote drafts to final reviews
```

### Mixed Visual + Text Assignment

```text
prepare-bundle-evidence
-> create contact sheet
-> build-assignment-review-text
-> agent reads contact sheet + assignment text bundle
-> agent writes draftReviews
-> agent checks:
     - possible 90+ scores
     - low scores
     - missing text
     - missing representative images
     - text/visual contradiction
-> promote dry-run
-> user confirms
-> promote drafts
```

### PDF-Heavy Assignment

For now:

```text
prepare-bundle-evidence
-> rendered PDF page images
-> contact sheet if visual comparison helps
-> individual original PDF/page review when text detail matters
```

After adding `pdftotext`:

```text
prepare-bundle-evidence
-> PDF text extraction
-> PDF page images only when visual/layout evidence is needed
-> assignment-level text bundle
-> contact sheet if visual/layout evidence matters
```

## Implementation Phases

### Phase 1: PDF Selectable Text Extraction

Add `pdftotext` detection to `tool-config.cjs` / `doctor.cjs`.

Update `prepare-evidence.cjs`:

- for PDFs, try `pdftotext` first when available;
- if extracted text is non-empty, write `<base>_text.txt`;
- include extracted PDF text in `review-text.md`;
- record `pdf_text` evidence item.
- render PDF pages when one of these is true:
  - `pdftotext` is missing;
  - extracted text is empty or too short;
  - rubric says PDF visual/layout/page evidence matters;
  - assignment type is visual, design, media, portfolio, report-with-layout, or mixed visual/document;
  - `--render-pdf-pages` is explicitly passed;
  - the PDF is needed for contact sheet or score-band verification.

Add a conservative default first:

```text
For existing visual/mixed workflows, keep rendering first 3 pages as today.
For text_document rubrics, allow text-first PDF handling and skip page rendering when text extraction succeeds and rubric does not require visual/page evidence.
```

This avoids breaking current design/media assignments where PDF appearance is part of the work.

Tests:

- PDF without `pdftotext` still renders pages and works as today;
- PDF with `pdftotext` adds text evidence;
- text extraction failure does not block visual PDF evidence;
- `review-text.md` includes PDF text only when extraction succeeds.
- text_document rubric can skip PDF page rendering when `pdftotext` succeeds;
- visual/mixed rubric still renders PDF pages even when text extraction succeeds.

### Phase 2: Assignment Text Bundle Script

Add `build-assignment-review-text.cjs`.

Tests:

- combines multiple students' `review-text.md`;
- preserves student order from student index;
- excludes skipped/completed by default;
- marks missing `review-text.md`;
- truncates per-student sections;
- writes summary counts;
- includes PDF text that flowed through per-student `review-text.md`;
- keeps output under `tmp/` in examples/docs.

### Phase 3: Wizard / Resume Suggestions

Update `start-review-wizard.cjs` and `resume-task.cjs` next actions:

- if rubric indicates `text_document` or `mixed_doc_visual`, suggest `build-assignment-review-text.cjs` after `prepare-bundle-evidence`;
- do not suggest contact sheet for pure text/document assignments unless visual evidence is present and rubric says it matters;
- do not block review if aggregate text is absent.

Tests:

- text_document rubric suggests assignment text bundle;
- visual rubric still suggests contact sheet;
- mixed_doc_visual suggests both when configured.

### Phase 4: Review Flow Documentation

Update:

- `workflows/fanya/03-student-review.md`
- `workflows/fanya-homework-review.md` if needed
- `README.md`
- `docs/demo.md`
- `docs/faq.md`

User-facing docs should say:

- text-heavy assignments can be reviewed from an assignment-level text summary;
- this summary is generated from each student's prepared text evidence;
- PDF selectable text can be included when `pdftotext` is available;
- PDF page images are still used when visual/layout evidence matters;
- the text summary does not replace original documents when content is incomplete or ambiguous.

### Phase 5: Optional Batch Draft Helper

Add a helper only if needed after Phase 1 proves useful:

```text
record-text-draft-reviews.cjs
```

But first version can reuse existing:

```text
record-draft-reviews.cjs
promote-draft-reviews.cjs
```

Avoid adding a new draft format unless the current draft review path is insufficient.

## Risks And Safeguards

### Risk: Over-reading Too Much Text

Mitigation:

- per-student char cap;
- total char cap;
- summary section listing truncation;
- rubric-driven priority.

### Risk: Missing Visual Quality

Mitigation:

- never use assignment text bundle as the only evidence when visual deliverables matter;
- use contact sheet for visual/video/PDF-page evidence;
- require original evidence review for high/low/borderline cases.

### Risk: Text Extraction Is Incomplete

Mitigation:

- mark missing/truncated/unreadable text;
- include `needsOriginalEvidence`;
- do not force scores when core content is not judgeable.

### Risk: Privacy

Mitigation:

- write aggregate text only under `tmp/`;
- do not print student text to stdout;
- `--summary-only` prints counts only;
- keep generated aggregate text ignored by git.

## Recommended First Version

Implement:

1. Poppler `pdftotext` detection and PDF text extraction;
2. conservative PDF rendering rules that keep current visual/mixed behavior safe;
3. `build-assignment-review-text.cjs`;
4. wizard/resume next-action suggestions;
5. workflow docs update;
6. tests for PDF text extraction, aggregation, and suggestions.

Do not implement OCR in the first version.

OCR should remain a later optional enhancement only if scanned/image-only PDFs become common enough to justify the dependency and slower processing.
