# 05 Safety Rules

## Website Boundary

Allowed:

- Read course, assignment, student submissions, and attachment previews.
- Open review pages only to read prompts and submissions.
- Download attachments into project `tmp/` for local read-only review.
- Write local `.cjs` result and rubric records.

Forbidden:

- Do not type scores into the website.
- Do not submit, save, publish, confirm, return, or modify online grading.
- Do not click return/rework actions.
- Do not upload files.
- Do not enter account, password, CAPTCHA, SMS, or MFA information.

## Rubric Confirmation

Every assignment must have a user-confirmed rubric `.cjs` record before student review starts.

## Result Recording

Use result `.cjs` records only:

```text
reviewed       -> completed
manual_review  -> completed
skipped        -> skipped
```

For runtime navigation, treat `completed + skipped` as handled.

If an attachment cannot be opened or processed, write `status: "manual_review"` with a useful `statusReason`, then continue to the next student.

## Privacy

Generic workflow docs must not contain real student names, student ids, teacher names, account details, classes, schools, or other private identifiers.

Task output records may contain student names and ids because they are the grading artifact for that specific task.
