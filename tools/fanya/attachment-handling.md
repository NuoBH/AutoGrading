# Attachment Handling

Goal: obtain enough local evidence to review a student's submission quickly and reliably.

## Modes

`web_download`:

- Extract attachment metadata from the browser review page.
- Download needed files into the current assignment work directory under `tmp/`.
- Prepare evidence for one student at a time.

`bundle_zip`:

- Read one assignment archive from `tmp/bundle/`.
- Extract into `tmp/work-<index>/bundle-<assignment>/`.
- Standardize student folders under `students/`.
- Prepare evidence from each student folder.

Never delete `tmp/bundle/`.

## Evidence Directory

Evidence stays inside each student folder:

```text
<student-dir>/evidence/
<student-dir>/evidence/review-assets.json
<student-dir>/evidence/prepare-evidence-log.json
```

Images that are already directly viewable stay in the student folder and are listed as `externalViewable`.

`review-assets.json` is the normal review entry point. `prepare-evidence-log.json` is written only for incomplete evidence runs. Agents should read the log only when `review-assets.json` has `evidenceComplete: false`.

`review-assets.json` keeps old list fields such as `externalViewable`, `generatedEvidence`, and `reviewText`, and also includes structured `evidenceItems` when prepared by the current tools. `evidenceItems` lets review helpers distinguish original images, video frames, PDF pages, document-derived images, text bundles, and unsupported evidence:

```js
{
  path: "clip_01.png",
  absolutePath: "C:/.../students/local-001/evidence/clip_01.png",
  kind: "video_frame",
  sourceKind: "video",
  sourceFile: "C:/.../students/local-001/clip.mp4",
  sourceBasename: "clip.mp4",
  generated: true,
  frameIndex: 1
}
```

Common `kind` values are `video_frame`, `pdf_page`, `image`, `doc_image`, `doc_text`, and `text_bundle`. Contact-sheet and review-state scripts use this metadata together with the confirmed rubric, so assignment-specific priorities should be written in the rubric rather than hard-coded into scripts.

Files that need processing:

- Video: sample rubric-driven representative frames. `reviewPriority.representativeMediaRules.videoFrameCount` may request 1-15 frames. `ffprobe` is strongly recommended for video-first or high frame counts so sampling can use the actual video duration; without it, fixed fallback timestamps are used.
- PDF: render up to the first three pages, reusing cached evidence if present.
- DOCX/PPTX: extract text and embedded media when possible.
- Archives: extract first, then process inner files by type.

## Failure Handling

If a file cannot be opened, converted, downloaded, or understood:

1. Do not force a score.
2. Write a result record with:

```js
{
  status: "manual_review",
  suggestedScore: null,
  comment: "需要人工复核",
  statusReason: "cannot_open_attachment"
}
```

3. Mark the student completed in session so the workflow can continue.

If the user intentionally skips a student, write:

```js
{
  status: "skipped",
  suggestedScore: null,
  comment: "已跳过",
  statusReason: "user_skipped"
}
```

## Cleanup

After the whole assignment is handled:

```powershell
node tools/fanya/scripts/cleanup-reviewed-work.cjs --confirm
```

or:

```powershell
node tools/fanya/scripts/cleanup-reviewed-bundle.cjs --confirm
```
