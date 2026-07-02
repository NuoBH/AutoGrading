# 03 Student Review

Only start after the assignment rubric `.cjs` is confirmed.

## Wizard Gate

Before opening a student submission, run the read-only wizard status command unless you are already inside a validated resumed task:

```powershell
node tools/fanya/scripts/start-review-wizard.cjs status --session-path "tmp/session/fanya-current-task.json"
```

If it returns `resume_or_repair`, run `resume-task.cjs` or the confirm-gated repair flow first. If it returns any `needs_*` status, complete that setup step before reviewing students. Only `ready_to_review` or a valid `resume_ready` state allows per-student evidence preparation and review.

## Shared Preflight

For both `web_download` and `bundle_zip`:

1. Confirm `courseName`, `assignmentName`, `rubricPath`, and `resultPath`.
2. Build a student index before asking for skipped students.
3. Match skipped student names to student ids using the temporary student index JSON.
4. Prefer the shared helper:

```powershell
node tools/fanya/scripts/apply-skipped-students.cjs --student-index "tmp/session/fanya-current-student-index.json" --result-path "<result.cjs>" --assignment "<assignment>" --session-path "tmp/session/fanya-current-task.json" --names "<name1>,<name2>"
```

It writes skipped students into the result record with:

```js
{
  status: "skipped",
  statusReason: "user_skipped"
}
```

Restore session state from the result record:

```text
reviewed       -> completedStudentKeys
manual_review  -> completedStudentKeys
skipped        -> skippedStudentKeys
```

`skippedStudentKeys` is not copied into `completedStudentKeys`. For `next-student` and `is-complete`, the handled set is `completedStudentKeys + skippedStudentKeys`.

Both modes use `tmp/session/fanya-current-student-index.json` as the student key and order source. Folder scanning is only a fallback and is mainly used to resolve local evidence folders.

Save the temporary student index at:

```text
tmp/session/fanya-current-student-index.json
```

Minimal shape:

```json
{
  "schemaVersion": 1,
  "courseName": "...",
  "assignmentName": "...",
  "reviewMode": "web_download",
  "source": "web_roster",
  "students": [
    {
      "studentName": "...",
      "studentKey": "20230001",
      "statusAtImport": "pending",
      "reviewUrl": "..."
    }
  ]
}
```

`statusAtImport` is a snapshot from the website roster or bundle import. Do not update it as review progresses; write review progress only to the result `.cjs` record and session keys.

`reviewUrl` is web-only. `bundle_zip` indexes omit it.

## Bundle Zip Mode

1. Put the assignment archive in:

```text
tmp/bundle/
```

2. Import:

```powershell
node tools/fanya/scripts/import-bundle.cjs --course "<course>" --assignment "<assignment>" --work-index <index> --rubric-path "<rubric.cjs>" --result-path "<result.cjs>"
```

3. The import extracts to:

```text
tmp/work-<index>/bundle-<assignment>/raw/
tmp/work-<index>/bundle-<assignment>/students/
```

4. The import writes `tmp/session/fanya-current-student-index.json` with `statusAtImport: "pending"` for each standardized student folder.
5. Ask whether to sync already-completed website rows before skipped-student selection:
   - If yes and the assignment review list is already open, extract the web roster from that page.
   - If yes and the browser is not already on the assignment review list, use the normal website navigation flow to enter the course and assignment review list first.
   - Run `sync-bundle-web-completed-flow.cjs` to capture all roster pages and match website `completed` rows against the bundle student index.
   - Only matched bundle students are written to result/session as already completed.
   - Do not change bundle index `statusAtImport`; it remains the bundle import snapshot.
   - If no, record the decision:

```powershell
node tools/fanya/scripts/task-session.cjs mark-completed-sync-decision --session-path "tmp/session/fanya-current-task.json" --decision no
```

6. After the website-completed sync decision, ask for skipped student names. Match them with `apply-skipped-students.cjs`.
   - If there are no skipped students, record that decision:

```powershell
node tools/fanya/scripts/task-session.cjs mark-skipped-decision --session-path "tmp/session/fanya-current-task.json" --decision none
```

7. Review the next unhandled student from session state.

Bundle mode does not use `webReviewUrl`, browser attachment extraction, or `web-download-student.cjs`. Its source files already exist under the standardized student folders.

Optional website completed sync:

```powershell
node tools/fanya/scripts/sync-bundle-web-completed-flow.cjs --session <browser-session> --student-index "tmp/session/fanya-current-student-index.json" --result-path "<result.cjs>" --assignment "<assignment>" --session-path "tmp/session/fanya-current-task.json" --roster-json "tmp/session/web-roster.json"
```

This sync is not a web-download step. It only writes `status: "reviewed"` with `statusReason: "already_completed_on_website"` to the result `.cjs` and adds matched keys to `completedStudentKeys`.

### Bundle Fast Review

Bundle mode defaults to the rubric's `fast_bundle` workflow when `reviewPriority.recommendedMode` allows it. This is a review strategy, not a shortcut around the rubric.

For visual, image, video, PDF, or mixed visual/document assignments, create a contact sheet for first-pass classwide calibration before per-student deep review when the rubric remains in `fast_bundle` mode:

```powershell
node tools/fanya/scripts/create-contact-sheet.cjs --students-dir "<students-dir>" --session-path "tmp/session/fanya-current-task.json" --out "<work-dir>/contact-sheet.svg" --map-out "<work-dir>/contact-sheet.json" --notes-out "tmp/session/contact-sheet-review-notes.json" --rubric-path "<rubric.cjs>"
```

Wizard and resume next-actions automatically add `--mode video-first --slots <n>` when the confirmed rubric configures video-first or multi-slot representative media. Use `--prefer "<comma-separated terms>"` only when the user or rubric gives a better assignment-specific order than `reviewPriority.representativeMediaTerms`.

With `--session-path`, contact sheet image selection uses each student's rubric-driven `reviewLoadPlan.primaryFiles` first, skips non-image primary files, and preserves primary image order by default. It falls back to directory image scanning only when primary files contain no image. Use `--prefer` only as an explicit user/rubric override.

Use the contact sheet only for first-pass classwide calibration. First-pass scores/comments must be stored as `draftReviews`, not final `reviews`, until the user confirms promotion. Draft comments must already be student-facing: no internal wording such as "draft", "contact sheet", "needs review", "formal grading", or equivalent process notes. Put internal issues in `reviewNotes` or `tmp/session/contact-sheet-review-notes.json`. Low scores, possible 90+ scores, blank/abnormal representative images, missing required deliverables, or unclear cases must be checked with the student's own evidence files.

Before promoting drafts to final reviews, run:

```powershell
node tools/fanya/scripts/promote-draft-reviews.cjs --result-path "<result.cjs>" --assignment "<assignment>" --session-path "tmp/session/fanya-current-task.json" --notes-path "tmp/session/contact-sheet-review-notes.json" --dry-run
```

Show the dry-run readiness summary to the user and promote only after confirmation.

For pure image submissions, contact sheet can run immediately after bundle import. For video/PDF submissions, run `prepare-bundle-evidence.cjs` first so video frames or PDF page renders exist under each student's `evidence/` folder; then create the contact sheet from those generated images. For pure text/document submissions, do not use contact-sheet drafts by default; use `review-text.md` and `reviewLoadPlan.primaryFiles` for fast per-student review.

Video frame count is driven by `reviewPriority.representativeMediaRules.videoFrameCount` and may be 1-15. `ffprobe` is strongly recommended for video-first or high frame counts because it lets `prepare-evidence.cjs` sample frames by video duration. If `ffprobe` is unavailable, evidence preparation still runs with fixed fallback timestamps.

If the confirmed rubric or user says video deliverables are primary, use video-first contact sheets:

```powershell
node tools/fanya/scripts/create-contact-sheet.cjs --students-dir "<students-dir>" --session-path "tmp/session/fanya-current-task.json" --out "<work-dir>/contact-sheet.svg" --map-out "<work-dir>/contact-sheet.json" --notes-out "tmp/session/contact-sheet-review-notes.json" --mode video-first --slots 2 --rubric-path "<rubric.cjs>"
```

Use multiple slots for any multi-core visual deliverables, not only videos. A visual/mixed rubric may request several representative images, PDF pages, document-derived images, renders, process images, or video frames. Prefer rubric `reviewPriority.representativeMediaSlots` for assignment-specific roles such as primary video, secondary video, process image, or final render. The slot schema should use `role`, `label`, `kinds`, `terms`, and `required`; old `name` / `priority` slots are tolerated but should be migrated. Do not hard-code assignment names or course-specific keywords in scripts. If contact-sheet notes report missing slots, non-video fallback, or document-derived images, inspect the student's primary files before finalizing drafts.

For large classes or many slots, split the contact sheet into pages:

```powershell
node tools/fanya/scripts/create-contact-sheet.cjs --students-dir "<students-dir>" --session-path "tmp/session/fanya-current-task.json" --out "<work-dir>/contact-sheet.svg" --map-out "<work-dir>/contact-sheet.json" --page-out-pattern "<work-dir>/contact-sheet-page-{page}.svg" --students-per-page 12 --rubric-path "<rubric.cjs>"
```

Use `--max-cells-per-page <n>` when the page size should be based on `students * slots`; use `--png-out-pattern "<work-dir>/contact-sheet-page-{page}.png"` when PNG page previews are needed.

Optional PNG preview:

```powershell
node tools/fanya/scripts/create-contact-sheet.cjs --students-dir "<students-dir>" --session-path "tmp/session/fanya-current-task.json" --out "<work-dir>/contact-sheet.svg" --map-out "<work-dir>/contact-sheet.json" --png-out "<work-dir>/contact-sheet.png" --rubric-path "<rubric.cjs>"
```

`--png-out` requires Python with Pillow. SVG and JSON remain the canonical contact-sheet artifacts.

For text-heavy or mixed document submissions, `prepare-evidence.cjs` may generate:

```text
<student-dir>/evidence/review-text.md
```

Read `review-text.md` before opening lower-priority document evidence. It is a cleaned, truncated text bundle intended to reduce repeated docx/pptx/text opening. If the assignment is pure long-form writing and the text bundle is insufficient, read the necessary original document evidence rather than relying on a contact sheet.

When preparing evidence for many bundle students at once, prefer summary output to avoid flooding chat/context with every path:

```powershell
node tools/fanya/scripts/prepare-bundle-evidence.cjs "<students-dir>" --session-path "tmp/session/fanya-current-task.json" --summary-only --json-out "<work-dir>/prepared-bundle-evidence.json"
```

The full details remain in `--json-out` and each student's own `evidence/review-assets.json` / `prepare-evidence-log.json`.

## Web Download Mode

1. Enter the assignment review list.
2. In `web_download`, validate names in the same order as the website flow:
   - After selecting a course, compare the web course name against the selected rubric/result `courseName`.
   - After selecting an assignment, compare the web assignment name against the selected rubric/result `assignmentName`.
   - Use exact `courseName` and `assignmentName` from the selected `.cjs` records as the expected context.
   - Ignore harmless whitespace and punctuation differences. If the loose names match, continue and sync the `.cjs` record names to the web names.
   - If a course or assignment still does not match, stop and ask the user to manually select the correct page.
   - If the user confirms reuse despite the mismatch, sync the `.cjs` record names to the web names before continuing.
3. Initialize web review state with `init-web-review.cjs`:

```powershell
node tools/fanya/scripts/init-web-review.cjs --session <browser-session> --course "<course>" --assignment "<assignment>" --rubric-path "<rubric.cjs>" --result-path "<result.cjs>" --sync-completed
```

4. This captures all student list pages, saves `tmp/session/web-roster.json`, and saves the parsed roster as `tmp/session/fanya-current-student-index.json` with `reviewMode: "web_download"` and `source: "web_roster"`.
   - On a real roster page, the pagination helper uses the page's next button. If pagination behavior is uncertain, first run:

```powershell
node tools/fanya/scripts/capture-web-roster.cjs --session <browser-session> --check-next-only
```

   - This check does not click. It only reports whether a next-page control exists and whether it appears disabled.
   - This structured extraction intentionally stores `studentName`, `studentKey`, `statusAtImport`, and `reviewUrl` for workflow state.
   - Do not use raw `browser-act state` as the normal roster capture method because it can print private roster text into chat/log output.
   - Parse extracted rows with `parseRosterRows()` from `tools/fanya/scripts/web-roster.cjs`, then save with `saveRosterStudentIndex()`.
5. Ask whether to read website review status before choosing `--sync-completed`:
   - If yes, website `completed` rows are written as `status: "reviewed"` with `statusReason: "already_completed_on_website"`.
   - Website rows containing `pending`, `To be reviewed`, `To be reviewed (Supplementary)`, `reformTo be reviewed`, `tobereviewed`, `reformTobereviewed`, `待批阅`, `待评阅`, `待批阅（补交）`, or `重做待批阅（补交）` are treated as pending.
   - If no, use the roster only as the temporary student index.
6. Ask for skipped student names and match them with `apply-skipped-students.cjs`.
   - Name matching is fuzzy for harmless spacing.
   - If a name cannot be matched to a student id, report it to the user.
   - Do not write a `skipped` record for unmatched names.
   - Do not guess an id from partial or unrelated names.
   - If there are no skipped students, run:

```powershell
node tools/fanya/scripts/task-session.cjs mark-skipped-decision --session-path "tmp/session/fanya-current-task.json" --decision none
```

7. For each pending web student:
   - Run `current-review-state.cjs`.
   - If `needsBrowserReviewPage` is true, open `webReviewUrl` in the current browser session.
   - Real smoke test confirmed a concrete `review-work` / `workAnswerId` `webReviewUrl` opens the matching student's review detail page without needing raw roster output.
   - Run `tools/fanya/scripts/extract-attachments.browser.js` in the browser page context.
   - Save the extraction JSON to `<studentDir>/extracted-attachments.json`.
   - Run `web-download-student.cjs` to build `<studentDir>/prepared-attachments.json`.
   - Run `download-attachments.cjs <studentDir>/prepared-attachments.json`.
   - Run `prepare-evidence.cjs "<studentDir>"`.
8. Review evidence and record the result with `record-review.cjs`.

```powershell
node tools/fanya/scripts/current-review-state.cjs --session-path "tmp/session/fanya-current-task.json"
node tools/fanya/scripts/web-download-student.cjs --state "tmp/session/current-review-state.json" --attachments "<studentDir>/extracted-attachments.json" --out "<studentDir>/prepared-attachments.json"
node tools/fanya/scripts/download-attachments.cjs "<studentDir>/prepared-attachments.json"
node tools/fanya/scripts/prepare-evidence.cjs "<studentDir>"
```

At the start of each student review, get the current navigation state:

```powershell
node tools/fanya/scripts/current-review-state.cjs --session-path "tmp/session/fanya-current-task.json"
```

Use its output as the navigation map: current student key/name, `studentDir`, `reviewAssetsPath`, generated evidence, `externalViewable`, `reviewLoadPlan`, and whether `prepare-evidence-log.json` must be read.

When reviewing a student after evidence preparation:

1. Open `<student-dir>/evidence/review-assets.json` first.
2. Follow `reviewLoadPlan.primaryFiles` first. This is the default minimal first pass and is usually capped at 4 files.
3. If `reviewLoadPlan.rubricPriority` exists, use it to decide which primary files matter most for this assignment.
4. Stop reading more files once the primary files justify a fair score band and a concise personalized 2-3 sentence comment.
5. Open `reviewLoadPlan.fallbackFiles` only when the score band is unclear, evidence looks contradictory, the work may deserve 90+, or the primary files do not show the core assignment content.
6. If `evidenceComplete` is `true`, do not read `prepare-evidence-log.json` during normal review.
7. If `evidenceComplete` is `false`, read `<student-dir>/evidence/prepare-evidence-log.json` only when the missing/failed files affect whether the work can be judged.
8. Write `manual_review` only when the core assignment content cannot be judged after this minimal-first-pass review.

This path rule is the same for web and bundle modes. `prepare-bundle-evidence.cjs` still writes each student's files inside that student's own `<student-dir>/evidence/` folder.

## Writing A Student Result

Write one review object into the result `.cjs` record:

```js
{
  studentName: "...",
  studentKey: "20230001",
  status: "reviewed",
  submissionSummary: "video/pdf/images",
  suggestedScore: 88,
  comment: "Personalized 2-3 sentence review",
  statusReason: ""
}
```

If the file cannot be opened or processed, do not force a score. Write:

```js
{
  studentName: "...",
  studentKey: "20230001",
  status: "manual_review",
  submissionSummary: "",
  suggestedScore: null,
  comment: "Needs manual review.",
  statusReason: "cannot_open_attachment"
}
```

Never overwrite an existing review with the same `studentKey`.

Personalized comments are the default. Each reviewed student comment should mention visible strengths, specific issues, or a concrete improvement direction from the inspected evidence. Avoid generic batch-template comments unless the result is a skipped/already-completed/manual-review placeholder.

If comments need batch revision after scores are already recorded, use the safe comment-only updater. It changes `comment` only and does not modify score, status, skipped/manual-review state, or other assignments:

```powershell
node tools/fanya/scripts/update-review-comments.cjs --result-path "<result.cjs>" --assignment "<assignment>" --updates "<comments.json>"
```

After deciding the review, write the result and advance session with one command:

```powershell
node tools/fanya/scripts/record-review.cjs --session-path "tmp/session/fanya-current-task.json" --student-key "<studentKey>" --student-name "<studentName>" --status reviewed --score 86 --summary "video frames" --comment "Work is complete and generally clear."
```

For `manual_review`, use `--status manual_review --status-reason cannot_open_attachment` and omit a numeric score. For skipped students, prefer the skip preflight; if recording one skip here, use:

```powershell
node tools/fanya/scripts/record-review.cjs --session-path "tmp/session/fanya-current-task.json" --student-key "<studentKey>" --student-name "<studentName>" --status skipped --summary "-" --comment "Skipped." --status-reason user_skipped
```

Check completion before cleanup:

```powershell
node tools/fanya/scripts/task-session.cjs is-complete
```

## Cleanup

After one assignment is fully handled:

```powershell
node tools/fanya/scripts/cleanup-reviewed-bundle.cjs --confirm
```

or:

```powershell
node tools/fanya/scripts/cleanup-reviewed-work.cjs --confirm
```

Do not delete `tmp/bundle/`.

After cleanup, clear only the current session and temporary student index files:

```powershell
node tools/fanya/scripts/task-session.cjs clear
```

Keep the `tmp/session/` directory itself.

## Resume A Task

Use the read-only resume helper first:

```powershell
node tools/fanya/scripts/resume-task.cjs --session-path "tmp/session/fanya-current-task.json"
```

The helper does not repair, reimport, redownload, clear, or write any grading state. It checks the current task session, result/rubric records, student index, and mode-specific local paths, then reports one of:

```text
resume_ready
complete
invalid_session
blocked
needs_user_action
can_rebuild_bundle
can_rebuild_web_index
```

For `bundle_zip`, `resume_ready` means the local bundle student folder is present, setup decisions are resolved, and the next student can continue from local evidence or `prepare-evidence.cjs`. If the result record already contains reviews for this assignment, resume does not repeat the website-completed sync or skipped-student prompts; it restores handled students from the result record and continues. If the result record is empty and the session is still at a setup gate, resume must stop and ask for the missing decision. `can_rebuild_bundle` means extracted files are missing but a bundle archive appears available; ask the user before reimporting.

For `web_download`, `resume_ready` may still require browser work. If the next student's evidence is missing and `webReviewUrl` exists, open that URL, extract attachments, download, and prepare evidence. `can_rebuild_web_index` means the roster/index must be rebuilt from the assignment review list before continuing.

If the helper returns `blocked`, do not continue grading until the missing result record or invalid state is resolved.

## Repair After Resume Diagnosis

Repair is not part of the normal review loop. Use it only after `resume-task.cjs` reports a repairable status, and only with explicit `--confirm`.

Diagnosis stays read-only:

```powershell
node tools/fanya/scripts/resume-task.cjs --session-path "tmp/session/fanya-current-task.json"
```

If status is `can_rebuild_bundle`, rebuild bundle runtime files from the existing bundle archive:

```powershell
node tools/fanya/scripts/repair-task.cjs --session-path "tmp/session/fanya-current-task.json" --confirm
```

Bundle repair only rebuilds local runtime state: extracted work dir, standardized student folders, student index, and session. It does not use browser roster/download scripts and never deletes `tmp/bundle/`. If local `local-*` keys changed, repair stops and asks for a user-confirmed mapping file:

```powershell
node tools/fanya/scripts/repair-task.cjs --session-path "tmp/session/fanya-current-task.json" --confirm --local-key-map "tmp/session/local-key-map.json"
```

If status is `can_rebuild_web_index`, open the correct assignment review list in the browser first, then rebuild only the web roster/index/session:

```powershell
node tools/fanya/scripts/repair-task.cjs --session-path "tmp/session/fanya-current-task.json" --confirm --browser-session <browser-session>
```

Web repair does not import bundles or redownload attachments. After repair, normal web per-student download resumes from `current-review-state.cjs`.

If status is `needs_user_action` because the rubric is missing, attach a matching confirmed rubric:

```powershell
node tools/fanya/scripts/repair-task.cjs --session-path "tmp/session/fanya-current-task.json" --confirm --rubric-path "<matching-rubric.cjs>"
```

Or regenerate a rubric only after the user has reviewed and confirmed the regenerated content:

```powershell
node tools/fanya/scripts/repair-task.cjs --session-path "tmp/session/fanya-current-task.json" --confirm --regenerate-rubric --rubric-path "<rubric.cjs>" --rubric-json "<rubric-content.json>" --confirm-rubric
```

Repair never creates a missing result `.cjs`. If the result record is missing, stop and start a new session or explicitly select/create a result outside repair.

For bundle repair, `result .cjs` remains the grading authority. Existing `reviewed`, `manual_review`, and `skipped` records are preserved. Existing `draftReviews` are preserved and remapped when local-key mapping is applied, but draft-only students remain pending. If the extracted bundle directory was rebuilt, pending students need evidence regenerated before review continues, and old contact sheet/mapping artifacts should be treated as stale.

After any repair, rerun:

```powershell
node tools/fanya/scripts/resume-task.cjs --session-path "tmp/session/fanya-current-task.json"
```

Continue only if it returns `resume_ready` or `complete`.

