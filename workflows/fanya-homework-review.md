# Fanya Homework Review Workflow

This is the reusable entry point for read-only homework review. Workflow docs are Markdown; grading data is stored in structured `.cjs` object records.

## Trigger And Wizard Gate

When the user says `开始泛雅评阅`, `开始泛雅作业评阅`, `Start Fanya review`, or `Start Fanya grading`, read this file first, then run the read-only wizard status check:

```powershell
node tools/fanya/scripts/start-review-wizard.cjs status --session-path "tmp/session/fanya-current-task.json"
```

Follow the wizard output before opening browser pages, importing bundles, preparing evidence, or reviewing students. If the wizard returns `resume_or_repair`, do not treat it as an error. For resume triggers, resolve the existing session with `resume-task.cjs` or repair. For a fresh new assignment, ask the user before clearing/replacing the old session, then rerun the wizard. Student review may start only after the wizard reaches `ready_to_review` or an explicitly resumed task reaches a valid review state.

If this is a freshly cloned repo, required local folders may not exist because runtime artifacts are gitignored. After the first wizard status check and before setup actions that write files, ensure the local workspace folders exist:

```powershell
node tools/fanya/scripts/setup-environment.cjs --prepare --check --print-install-guide
node tools/fanya/scripts/doctor.cjs
```

`setup-environment.cjs` creates `tmp/`, `tmp/bundle/`, `tmp/session/`, `rubrics/`, `result/`, and `outputs/` when missing and prints missing dependency guidance. Do not create sample student indexes or placeholder result/rubric records just to satisfy setup gates.

When the user says `继续评阅`, `继续泛雅评阅`, `Resume Fanya review`, or `Continue Fanya grading`, treat it as a resume request. Read this workflow, run the wizard status check above, then run:

```powershell
node tools/fanya/scripts/resume-task.cjs --session-path "tmp/session/fanya-current-task.json"
```

Follow `resume-task.cjs` output. Continue only from `resume_ready`; repair only after an explicit repairable status and user confirmation.

Internal handoff notes, when present in a private workspace, are for project development and recovery context. They are not required for normal grading runs unless this workflow is ambiguous or missing context.

## Start Of Every Run

Ask the user for:

- Review mode: `web_download` or `bundle_zip`.
- Whether an existing rubric `.cjs` applies.
- Whether an existing result `.cjs` applies.

If either existing file applies, read `courseName`, `assignmentName`, `rubricPath`, and `resultPath` from that file where possible. If neither file exists, use the website to enter the course and assignment list, then let the user choose the assignment.

If no rubric exists, use the website to read the assignment description, generate a rubric object, and wait for user confirmation.

Mode is passed to the wizard with `--mode`; there is no `choose-bundle-zip` subcommand. Example:

```powershell
node tools/fanya/scripts/start-review-wizard.cjs status --mode bundle_zip --session-path "tmp/session/fanya-current-task.json"
```

When website context is required, default to `https://i.chaoxing.com/`, let the user log in, then enter `课程`. Use the school portal path only as a fallback.

If no result exists, create one with:

```powershell
node tools/fanya/scripts/create-result.cjs --course "<course>" --assignment "<assignment>" --rubric-path "<rubric.cjs>"
```

## Required Order

1. Choose mode and record sources.
2. Use browser navigation helpers when website context is required. See [00-browser-navigation.md](fanya/00-browser-navigation.md).
3. Enter the target course when website context is required. See [01-login-and-course-entry.md](fanya/01-login-and-course-entry.md).
4. Read the assignment description and confirm rubric when a new rubric is needed. See [02-assignment-rubric.md](fanya/02-assignment-rubric.md).
5. When website context is required, select and validate in order:
   - Select course first. Compare the web course name against the selected rubric/result course name.
   - Select assignment second. Compare the web assignment name against the selected rubric/result assignment name.
   - If names differ only by whitespace or punctuation, continue and sync the `.cjs` record names to the web names.
   - If names still differ semantically, stop and ask the user whether to choose another page, confirm reuse, or create new records.
6. Build a student index before asking for skipped students:
   - `web_download`: enter the assignment review page and extract all student-list pages.
   - `bundle_zip`: import the bundle and standardize student folders.
   - Save the temporary index as `tmp/session/fanya-current-student-index.json`.
   - Store each row as `{ studentName, studentKey, statusAtImport }`; `web_download` rows also include `reviewUrl`.
   - `statusAtImport` is only the roster/import snapshot, not review progress.
7. In `bundle_zip`, ask whether to read the website roster and mark already-reviewed students. If the user says no, record that decision with `task-session.cjs mark-completed-sync-decision --decision no`.
8. Ask whether any students should be skipped, match names to ids, and write `skipped` result records.
9. Initialize review state from the result `.cjs` record and selected mode.
10. Review students. For bundle fast review, including video-first contact sheets, multi-slot contact sheets, and assignment-level text bundles, follow [03-student-review.md](fanya/03-student-review.md) after the wizard reaches `ready_to_review` or resume reaches `resume_ready`. Wizard/resume commands derive contact-sheet `--mode` / `--slots` and text-bundle suggestions from the confirmed rubric when configured.
11. Maintain output records. See [04-output-files.md](fanya/04-output-files.md).
12. Follow safety rules. See [05-safety-rules.md](fanya/05-safety-rules.md).

## Hard Rules

- Read student submissions only.
- Do not type scores into the website.
- Do not submit, save, publish, return, or modify student work online.
- Do not review any student before the assignment rubric is confirmed.
- Store rubrics as `rubrics/<course>/<assignment>-rubric.cjs`.
- Store review output as `result/<course>-作业评价汇总-<date>.cjs`.
- Most scores should fall in 80-90; 90+ is only for clearly excellent work.
- Personalized, specific 2-3 sentence comments are the default for reviewed students.
- If a submission cannot be opened or processed, write a `manual_review` result record and continue.
- If the user skips a student, write a `skipped` result record and add the key only to `skippedStudentKeys`.

## Data Source

The result `.cjs` record is the long-term source of truth. The session JSON in `tmp/session/fanya-current-task.json` and student index JSON in `tmp/session/fanya-current-student-index.json` are only resumable runtime state.

