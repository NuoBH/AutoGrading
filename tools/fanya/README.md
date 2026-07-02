# Fanya Review Tools

These scripts support read-only homework review. They organize attachments, prepare local evidence, and maintain structured result/rubric records.

## Canonical Records

Use structured `.cjs` object files:

```text
result/<course>-作业评价汇总-<date>.cjs
rubrics/<course>/<assignment>-rubric.cjs
```

Do not create new result or rubric Markdown files. Workflow docs remain Markdown.

## Core Scripts

- `scripts/start-review-wizard.cjs`: read-only workflow gate for new grading runs; reports whether to choose mode, resolve rubric/result, build student index, ask skipped students, resume/repair, or start review.
- `scripts/record-store.cjs`: creates and updates structured result/rubric records.
- `scripts/create-result.cjs`: creates a result `.cjs` record.
- `scripts/result-utils.cjs`: helpers for result state, skipped records, and website-completed records.
- `scripts/student-matcher.cjs`: shared name/id matching for web rosters and bundle folders.
- `scripts/student-index.cjs`: writes and clears the temporary student index at `tmp/session/fanya-current-student-index.json`.
- `scripts/capture-web-roster.cjs`: captures all visible web roster pages from an active browser-act session and writes `tmp/session/web-roster.json`.
- `scripts/apply-skipped-students.cjs`: shared web/bundle helper for matching skipped names against the temporary student index and writing skipped result/session state.
- `scripts/init-web-review.cjs`: web-mode initialization wrapper after the assignment review list is open; captures roster, writes the web student index, restores result state, and initializes session.
- `scripts/sync-bundle-web-completed-flow.cjs`: bundle-mode wrapper that captures website roster pages and syncs matched website-completed rows into result/session.
- `scripts/sync-web-completed-students.cjs`: optional bundle-mode sync from website completed roster rows into result/session.
- `scripts/review-context.cjs`: validates selected course/assignment context before reusing existing rubric/result records.
- `scripts/browser-navigation-utils.cjs`: ranks navigation candidates, detects ambiguous matches, and recommends refresh/manual-login recovery.
- `scripts/browser-eval-snippets.cjs`: prints short, structured browser-act eval snippets for page state, assignment review summary, student detail summary, and roster-page extraction.
- `scripts/web-roster.cjs`: browser-side roster extraction script plus Node-side roster parsing and student-index helpers.
- `scripts/import-bundle.cjs`: imports one assignment archive from `tmp/bundle/`, standardizes student folders, restores completed/skipped ids from result records, writes skipped records, and initializes session state.
- `scripts/task-session.cjs`: maintains `tmp/session/fanya-current-task.json`; commands include `get`, `next-student`, `mark-completed`, `mark-skipped`, `mark-completed-sync-decision`, `mark-skipped-decision`, `is-complete`, and `clear`.
- `scripts/current-review-state.cjs`: derives the current student navigation view from session, student index, result, and evidence files, including `reviewLoadPlan` for minimal first-pass evidence reading.
- `scripts/resume-task.cjs`: read-only task resume diagnosis; validates session paths and prints next safe actions.
- `scripts/repair-task.cjs`: explicit `--confirm` repair command after resume diagnosis; can attach/regenerate missing rubrics, rebuild bundle runtime state, or rebuild web roster/index state.
- `scripts/record-review.cjs`: writes one result review and advances session completed/skipped state in one command.
- `scripts/update-review-comments.cjs`: safely updates existing review comments from JSON without changing scores, statuses, skipped/manual-review state, or other assignments.
- `scripts/web-download-student.cjs`: web-only bridge from current review state plus browser attachment extraction JSON to a prepared attachment download manifest.
- `scripts/extract-attachments.browser.js`: extracts attachment metadata from the current browser review page.
- `scripts/prepare-attachments.cjs`: turns extracted metadata into download/processing actions.
- `scripts/download-attachments.cjs`: downloads attachment files to project `tmp/`.
- `scripts/prepare-evidence.cjs`: prepares per-student evidence, writes `evidence/review-assets.json`, may write `evidence/review-text.md` for document/text evidence, and writes `evidence/prepare-evidence-log.json` only when evidence is incomplete.
- `scripts/prepare-bundle-evidence.cjs`: optional batch evidence generation; skips completed/skipped students when given a session path and supports `--summary-only --json-out <path>` to avoid noisy stdout.
- `scripts/create-contact-sheet.cjs`: bundle-mode visual calibration helper; creates an SVG contact sheet plus JSON mapping from standardized student folders, and can optionally render a PNG preview with `--png-out`.
- `scripts/export-result-xlsx.cjs`: final local Excel exporter; converts a structured result `.cjs` into one `.xlsx` workbook with one worksheet per assignment.
- `scripts/cleanup-reviewed-work.cjs`: deletes a reviewed web-download work directory after assignment completion.
- `scripts/cleanup-reviewed-bundle.cjs`: deletes only the reviewed bundle zip and extracted work directory; never deletes `tmp/bundle/`.
- `scripts/doctor.cjs`: checks local tools and project folders.
- `scripts/init-config.cjs`: detects ffmpeg, ffprobe, 7-Zip, tar, and Poppler paths into local config.

## Local Tool Notes

- `ffmpeg` is required for video frame extraction.
- `ffprobe` is strongly recommended for video-first review and `videoFrameCount > 3`; when available, video frames are sampled by video duration. If unavailable, evidence preparation falls back to fixed timestamps.
- Python with Pillow is optional and only needed for `create-contact-sheet.cjs --png-out`. SVG and JSON contact-sheet output do not require Pillow.

## Browser Navigation Helpers

Read-only browser snippets live in `tools/fanya/browser/`:

- `page-state.browser.js`: extracts URL, title, readyState, visible text, and iframe text for state detection.
- `navigation-candidates.browser.js`: extracts visible clickable/link-like candidates after login.
- `course-list.browser.js`: extracts visible course candidates.
- `assignment-list.browser.js`: extracts visible assignment/review-list candidates.
- `assignment-description.browser.js`: extracts title, score hints, description text, and attachment hints from a read-only review detail page.

These snippets do not enter credentials and do not submit, save, score, publish, return, or export grades. If pages are blank/loading, refresh once and rerun page-state; if still unresolved, ask the user. If course or assignment candidates are duplicate or ambiguous, ask the user to choose.

Default login entry is `https://i.chaoxing.com/`, then `课程`, then the user-confirmed course. Use an institution-specific portal only as a fallback when the direct Chaoxing entry cannot reach the expected account/course context, and let the user confirm any portal-specific navigation labels.

Current `browser-act` does not support `eval --script-file`. In real runs, use short inline `browser-act eval` checks or snippets generated by `browser-eval-snippets.cjs`.

```powershell
$script = node tools/fanya/scripts/browser-eval-snippets.cjs page-state-lite
browser-act --session <session> eval "$script"
```

On the course assignment list page, prefer `browser-act state` to choose visible assignment cards and `批阅` buttons. A short inline eval is acceptable only when it returns assignment titles, work ids/link targets, and aggregate counts. Avoid long generic DOM scans over `a,li,div,tr`; they have repeatedly triggered browser-act long-eval/log permission errors.

Avoid raw `browser-act state` on roster pages because it can print private student names, ids, and IPs. This does not prohibit student indexing: structured roster extraction should read and store `studentName`, `studentKey`, `statusAtImport`, and web-only `reviewUrl` in `tmp/session/fanya-current-student-index.json`.

For all-page roster extraction from the assignment review list, prefer:

```powershell
node tools/fanya/scripts/capture-web-roster.cjs --session <browser-session> --course "<course>" --assignment "<assignment>" --out "tmp/session/web-roster.json"
```

It writes `tmp/session/web-roster.json` and prints aggregate counts only. The lower-level `roster-page` snippet and `parseRosterRows()` remain available for debugging or tests.

To test roster pagination on a real page without clicking:

```powershell
node tools/fanya/scripts/capture-web-roster.cjs --session <browser-session> --check-next-only
```

This prints only next-control diagnostics. If it cannot see a usable next button on a multi-page roster, inspect the page before running all-page capture.

When running real browser smoke tests from Codex, these Node scripts internally spawn `browser-act`. If they fail with `Permission denied: ... browseract/logs/.../main.log`, rerun the Node script with approved/non-sandbox permissions. The sandbox user may not have write access to browser-act's global log file even though direct `browser-act ...` commands work.

## Start Review Wizard

For normal user-triggered grading runs, start with:

```powershell
node tools/fanya/scripts/start-review-wizard.cjs status --session-path "tmp/session/fanya-current-task.json"
```

Follow its JSON status before browser navigation, bundle import, evidence preparation, or student review. `ready_to_review` means the required setup gates have been satisfied. `resume_or_repair` means an existing task session must be resumed or repaired before a new setup starts.

For resume triggers such as `继续评阅` or `继续泛雅评阅`, run the wizard status check first, then:

```powershell
node tools/fanya/scripts/resume-task.cjs --session-path "tmp/session/fanya-current-task.json"
```

## User-Facing Terms

When explaining the workflow to users, prefer plain Chinese labels while keeping backend names unchanged in commands and files:

```text
bundle_zip       -> 压缩包批阅模式
web_download     -> 网页批阅模式
rubric .cjs      -> 评分标准文件
result .cjs      -> 评阅记录文件
student index    -> 学生名单索引
task session     -> 当前批阅进度
contact sheet    -> 作品总览图
evidence         -> 作业证据/可查看材料
primaryFiles     -> 优先查看材料
xlsx export      -> 导出 Excel 表格
worksheet        -> Excel 工作表
dry-run          -> 预检查
```

Do not rename JSON keys, CLI flags, script names, or record fields.

## Create Result Record

```powershell
node tools/fanya/scripts/create-result.cjs --course "<course>" --assignment "<assignment>" --rubric-path "<rubric.cjs>"
```

## Bundle Flow

1. Confirm or create rubric `.cjs`.
2. Confirm or create result `.cjs`.
3. Put the assignment archive in `tmp/bundle/`.
4. Import:

```powershell
node tools/fanya/scripts/import-bundle.cjs --course "<course>" --assignment "<assignment>" --work-index <index> --rubric-path "<rubric.cjs>" --result-path "<result.cjs>"
```

5. Ask whether to sync already-completed website rows after import and before skipped-student selection.
   - Use the normal browser navigation flow to enter the assignment review list if it is not already open.
   - Run `sync-bundle-web-completed-flow.cjs`.
   - Matched completed rows are written to result/session only; bundle index `statusAtImport` remains `pending`.
   - If the user says no, record the decision:

```powershell
node tools/fanya/scripts/task-session.cjs mark-completed-sync-decision --session-path "tmp/session/fanya-current-task.json" --decision no
```

6. Ask for skipped students after import and optional completed sync. Match names against `tmp/session/fanya-current-student-index.json`, the same temporary student index used by web mode.
   - Use `apply-skipped-students.cjs`.
   - If a skipped name does not match any student in the temporary index, it is reported and no skipped record is written.
   - Harmless extra spaces inside names are ignored during matching.
   - If there are no skipped students, record the decision:

```powershell
node tools/fanya/scripts/task-session.cjs mark-skipped-decision --session-path "tmp/session/fanya-current-task.json" --decision none
```

7. Resume:

```powershell
node tools/fanya/scripts/task-session.cjs next-student
```

8. For bundle fast review, optionally create a visual contact sheet and/or prepare evidence with quiet summary output:

```powershell
node tools/fanya/scripts/prepare-bundle-evidence.cjs "<students-dir>" --session-path "tmp/session/fanya-current-task.json" --summary-only --json-out "<work-dir>/prepared-bundle-evidence.json"
node tools/fanya/scripts/create-contact-sheet.cjs --students-dir "<students-dir>" --session-path "tmp/session/fanya-current-task.json" --out "<work-dir>/contact-sheet.svg" --map-out "<work-dir>/contact-sheet.json" --notes-out "tmp/session/contact-sheet-review-notes.json" --rubric-path "<rubric.cjs>"
```

Wizard/resume next-actions add `--mode video-first --slots <n>` automatically when the confirmed rubric says video-first or multi-slot evidence is needed. For pure image submissions, the contact sheet can run before evidence preparation. For video/PDF submissions, prepare evidence first so generated frames/pages are available. With `--session-path`, the contact sheet chooses representative images from each student's rubric-driven `reviewLoadPlan.primaryFiles` first, skips non-image primary files, and preserves primary image order by default. It falls back to directory image scanning only when primary files contain no image. Default representative terms are script fallback terms for fallback scans; rubric `representativeMediaTerms` should contain assignment-specific terms only. Use contact sheets only for first-pass calibration. Review comments should be personalized 2-3 sentence comments by default, and the agent should still inspect primary evidence for unclear, low-score, possible 90+, blank, abnormal, or missing-deliverable cases.

Before promoting fast-bundle drafts, run the dry-run readiness check and show the summary to the user:

```powershell
node tools/fanya/scripts/promote-draft-reviews.cjs --result-path "<result.cjs>" --assignment "<assignment>" --session-path "tmp/session/fanya-current-task.json" --notes-path "tmp/session/contact-sheet-review-notes.json" --dry-run
```

For video-heavy or multi-deliverable visual assignments, use a rubric-driven video-first contact sheet only when the confirmed rubric or user says video evidence is primary:

```powershell
node tools/fanya/scripts/create-contact-sheet.cjs --students-dir "<students-dir>" --session-path "tmp/session/fanya-current-task.json" --out "<work-dir>/contact-sheet.svg" --map-out "<work-dir>/contact-sheet.json" --notes-out "tmp/session/contact-sheet-review-notes.json" --mode video-first --slots 2 --rubric-path "<rubric.cjs>"
```

`--slots` supports 1-15. Assignment-specific roles and terms belong in `reviewPriority.representativeMediaSlots`, not in scripts. Video frame count is normally set in `reviewPriority.representativeMediaRules.videoFrameCount`.

Optional PNG preview:

```powershell
node tools/fanya/scripts/create-contact-sheet.cjs --students-dir "<students-dir>" --session-path "tmp/session/fanya-current-task.json" --out "<work-dir>/contact-sheet.svg" --map-out "<work-dir>/contact-sheet.json" --png-out "<work-dir>/contact-sheet.png" --rubric-path "<rubric.cjs>"
```

Contact-sheet first-pass output is stored as drafts, not final reviews:

```powershell
node tools/fanya/scripts/record-draft-reviews.cjs --result-path "<result.cjs>" --assignment "<assignment>" --drafts "<drafts.json>"
node tools/fanya/scripts/promote-draft-reviews.cjs --result-path "<result.cjs>" --assignment "<assignment>" --session-path "tmp/session/fanya-current-task.json"
```

Drafts do not count as completed. Promote only after the user accepts the draft output; promotion validates the current student index before writing formal reviews.

## Final Excel Export

After reviews are final, export a local workbook:

```powershell
node tools/fanya/scripts/export-result-xlsx.cjs --result-path "<result.cjs>" --out-dir "outputs"
```

Recommended:

```powershell
node tools/fanya/scripts/export-result-xlsx.cjs --result-path "<result.cjs>" --out-dir "outputs" --dry-run
node tools/fanya/scripts/export-result-xlsx.cjs --result-path "<result.cjs>" --out-dir "outputs"
```

Default workbook behavior:

- One result `.cjs` becomes one `.xlsx`.
- Each assignment becomes its own worksheet.
- Default columns are `学生姓名`, `学号/编号`, `分数`, and `评语`.
- Formal `reviews` are exported; `draftReviews` are excluded unless `--include-drafts` is explicitly used for QA.
- Command output prints aggregate counts and validation issues only, not student rows.

9. After each written review:

```powershell
node tools/fanya/scripts/task-session.cjs mark-completed --student-key "<student id>"
```

10. Before cleanup:

```powershell
node tools/fanya/scripts/task-session.cjs is-complete
```

After cleanup, clear only the current session state and temporary student index files:

```powershell
node tools/fanya/scripts/task-session.cjs clear
```

Keep the `tmp/session/` directory.

Optional completed sync command:

```powershell
node tools/fanya/scripts/sync-bundle-web-completed-flow.cjs --session <browser-session> --student-index "tmp/session/fanya-current-student-index.json" --result-path "<result.cjs>" --assignment "<assignment>" --session-path "tmp/session/fanya-current-task.json" --roster-json "tmp/session/web-roster.json"
```

This command is for `bundle_zip` only. It does not download attachments and does not change the bundle student index source/status fields.

## Web Roster Flow

On the assignment review list page:

```powershell
node tools/fanya/scripts/init-web-review.cjs --session <browser-session> --course "<course>" --assignment "<assignment>" --rubric-path "<rubric.cjs>" --result-path "<result.cjs>" --sync-completed
```

This captures all roster pages, writes `tmp/session/web-roster.json`, writes the web temporary student index, restores handled state from the result record, optionally records website-completed students, and initializes `tmp/session/fanya-current-task.json`. Website-completed students are written as `status: "reviewed"` with `statusReason: "already_completed_on_website"` rather than `skipped`.

Temporary student index shape:

```json
{
  "schemaVersion": 1,
  "courseName": "...",
  "assignmentName": "...",
  "reviewMode": "web_download",
  "source": "web_roster",
  "students": [
    { "studentName": "...", "studentKey": "20230001", "statusAtImport": "pending", "reviewUrl": "..." }
  ]
}
```

`statusAtImport` is never updated during grading; review progress lives in result `.cjs` and `tmp/session/fanya-current-task.json`. `reviewUrl` is web-only and should be omitted for `bundle_zip`.

Both `web_download` and `bundle_zip` use `tmp/session/fanya-current-student-index.json` as the student key and order source. Folder scanning is only a fallback and mainly resolves local evidence folders.

## Web Per-Student Download

`web_download` uses `reviewUrl` from the temporary student index to open one student's browser review page, then downloads that student's attachments into the local web work directory.

```powershell
node tools/fanya/scripts/current-review-state.cjs --session-path "tmp/session/fanya-current-task.json" > tmp/session/current-review-state.json
```

Open `webReviewUrl` from that state in the active browser session. Then evaluate `tools/fanya/scripts/extract-attachments.browser.js` in the browser page context and save the JSON as:

```text
<studentDir>/extracted-attachments.json
```

Build and download the manifest:

```powershell
node tools/fanya/scripts/web-download-student.cjs --state tmp/session/current-review-state.json --attachments "<studentDir>/extracted-attachments.json" --out "<studentDir>/prepared-attachments.json"
node tools/fanya/scripts/download-attachments.cjs "<studentDir>/prepared-attachments.json"
node tools/fanya/scripts/prepare-evidence.cjs "<studentDir>"
```

`bundle_zip` does not use `reviewUrl`, browser attachment extraction, or `web-download-student.cjs`; its files already exist in standardized local student folders.

## Evidence Review Rule

After running `prepare-evidence.cjs`, read `<student-dir>/evidence/review-assets.json` first, then run `current-review-state.cjs` and follow `reviewLoadPlan.primaryFiles`. This is a minimal first pass, usually capped at 4 files. Stop once those files justify a fair score band and concise comment. Open `reviewLoadPlan.fallbackFiles` only when the score band is unclear, evidence conflicts, the work may deserve 90+, or the primary files do not show the core assignment content.

Read `<student-dir>/evidence/prepare-evidence-log.json` only when `review-assets.json` has `evidenceComplete: false` and the missing/failed files affect whether the work can be judged.

This location is identical in web and bundle modes. Batch bundle preparation with `prepare-bundle-evidence.cjs` calls `prepareEvidence()` per student, so each incomplete student's log is still under that student's own `evidence/` folder.

## Per-Student Review Loop

To resume an interrupted task, start with:

```powershell
node tools/fanya/scripts/resume-task.cjs --session-path "tmp/session/fanya-current-task.json"
```

This command is read-only. It reports whether the task is `resume_ready`, `complete`, `blocked`, needs user action, or can rebuild bundle/web runtime state. Follow its `nextActions` before running per-student commands.

For `bundle_zip`, resume does not repeat website-completed sync or skipped-student prompts when the result record already has reviews for the assignment. It restores handled keys from the result record. If the result is still empty and the session is paused at a setup decision, resume returns `needs_user_action`.

## Repair After Resume Diagnosis

`resume-task.cjs` remains read-only. If it reports a repairable runtime issue, use `repair-task.cjs` as a separate confirm-gated write operation.

Bundle runtime repair:

```powershell
node tools/fanya/scripts/repair-task.cjs --session-path "tmp/session/fanya-current-task.json" --confirm
```

This reimports the existing bundle archive into staging first, compares repaired student keys against old/session/result keys, then replaces only the bundle work dir, student index, and session if comparison passes. It does not use browser download scripts and never deletes `tmp/bundle/`. `result .cjs` remains the grading authority; reviewed/manual/skipped records are preserved. If extracted bundle files were rebuilt, pending students need evidence regenerated and old contact sheet/mapping files are stale.

If bundle repair detects shifted `local-*` identities, provide a user-confirmed mapping file:

```json
{
  "schemaVersion": 1,
  "mappings": [
    { "oldStudentKey": "local-001", "newStudentKey": "local-003" }
  ]
}
```

Then run:

```powershell
node tools/fanya/scripts/repair-task.cjs --session-path "tmp/session/fanya-current-task.json" --confirm --local-key-map "tmp/session/local-key-map.json"
```

Web roster/index repair:

```powershell
node tools/fanya/scripts/repair-task.cjs --session-path "tmp/session/fanya-current-task.json" --confirm --browser-session <browser-session>
```

The browser must already be on the correct assignment review list. This rebuilds `tmp/session/web-roster.json`, the temporary student index, and session only; it does not import bundles or redownload attachments.

Rubric pointer repair:

```powershell
node tools/fanya/scripts/repair-task.cjs --session-path "tmp/session/fanya-current-task.json" --confirm --rubric-path "<matching-rubric.cjs>"
```

Regenerate a missing rubric only after the user has confirmed the regenerated rubric content:

```powershell
node tools/fanya/scripts/repair-task.cjs --session-path "tmp/session/fanya-current-task.json" --confirm --regenerate-rubric --rubric-path "<rubric.cjs>" --rubric-json "<rubric-content.json>" --confirm-rubric
```

Repair never creates a missing result `.cjs`; start a new session or explicitly select/create a result outside repair. After every repair, rerun `resume-task.cjs` and continue only from `resume_ready` or `complete`.

At the start of each student review:

```powershell
node tools/fanya/scripts/current-review-state.cjs --session-path "tmp/session/fanya-current-task.json"
```

After deciding the review:

```powershell
node tools/fanya/scripts/record-review.cjs --session-path "tmp/session/fanya-current-task.json" --student-key "<student id>" --student-name "<student name>" --status reviewed --score 86 --summary "video frames" --comment "Work is complete and generally clear."
```

Use `--status manual_review --status-reason cannot_open_attachment` when the core assignment content cannot be judged. Use `--status skipped --status-reason user_skipped` only for explicitly skipped students.

## Context Validation

When reusing an existing rubric/result record in web mode:

1. Validate course name after selecting the course.
2. Validate assignment name after selecting the assignment.
3. If `validateReviewContext` returns `sync_names`, call `syncRecordContext` on the selected `.cjs` records so their internal names match the web page.
4. If it returns `manual_select_required`, ask the user to choose the correct page or explicitly confirm reuse before syncing names.

## Tests

```powershell
node --test .\tools\fanya\tests\*.test.cjs
```

Current automated coverage includes:

- resume edge cases and read-only resume diagnosis;
- pseudo bundle full flow from zip import through evidence, result recording, and cleanup;
- pseudo web full flow from roster/index through local attachment download, evidence, and result recording;
- real `prepare-evidence.cjs` toolchain coverage for images, PDFs, videos, docx, pptx, zip, 7z, unsupported files, and missing-tool fallback paths;
- high-priority consistency checks such as empty/duplicate student indexes, mode/context mismatch, invalid review assets, no-overwrite result writes, skipped/completed separation, and cleanup safety.

Real browser login/navigation remains a separate smoke test because it depends on an authenticated browser session.

## External Tools

Initialize local config:

```powershell
node tools/fanya/scripts/init-config.cjs
```

Run diagnostics:

```powershell
node tools/fanya/scripts/doctor.cjs
```

