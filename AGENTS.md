# Project Agent Instructions

## Fanya Review Trigger

When the user says `开始泛雅评阅`, `开始泛雅作业评阅`, `Start Fanya review`, or `Start Fanya grading`, start the wizard-gated Fanya workflow.

Encoding fallback: if the Chinese trigger text renders incorrectly in a terminal, still treat any user request meaning "start Fanya review/grading" as this trigger.

When the user says `继续评阅`, `继续泛雅评阅`, `Resume Fanya review`, or `Continue Fanya grading`, resume the current Fanya task instead of starting a new setup.

Required first actions:

1. Read `workflows/fanya-homework-review.md`.
2. Run:

```powershell
node tools/fanya/scripts/start-review-wizard.cjs status --session-path "tmp/session/fanya-current-task.json"
```

3. Follow the wizard output before doing browser navigation, bundle import, evidence preparation, or student review.
4. For resume triggers, also run:

```powershell
node tools/fanya/scripts/resume-task.cjs --session-path "tmp/session/fanya-current-task.json"
```

5. Do not review students unless the wizard status is `ready_to_review`, or an existing session has first been resolved through resume/repair and then reaches a valid review state.
6. Private handoff notes, when present, are only for project development, recovery context, or resolving workflow-doc ambiguity. They are not required for normal user grading runs.

Hard boundaries:

- Do not enter grades or submit anything on the website.
- Do not review any student before the rubric is confirmed.
- Do not skip the student index and skipped-student decision gates.
- Keep real student names, ids, account details, class names, and school names out of scripts, tests, workflow docs, and handoff docs.
