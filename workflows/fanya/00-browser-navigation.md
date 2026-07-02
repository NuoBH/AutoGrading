# 00 Browser Navigation Helpers

Goal: reduce repeated browser navigation while keeping login and grading actions safe.

## Safety Boundary

- The user logs in manually.
- Never enter account, password, CAPTCHA, SMS, MFA, or SSO approval.
- Never click submit, save, score, publish, return, or export-score controls.
- Use snippets to read page state and candidate lists before clicking.
- Structured roster extraction may read student names, ids, and statuses to build the temporary student index. Do not dump the raw roster page with `browser-act state` in normal workflow because it can print private student names, ids, and IPs into chat/log output.

## Standard Sequence

1. Open `https://i.chaoxing.com/` by default.
2. Let the user log in manually.
3. Run a lightweight page-state extraction. Current `browser-act` does not support `eval --script-file`; prefer `tools/fanya/scripts/browser-eval-snippets.cjs`.
4. If the state is blank/loading/unknown, refresh once and rerun page-state. If still unresolved, ask the user.
5. If login is required, ask the user to log in manually, then rerun page-state.
6. Click `课程` from the Chaoxing home/personal space page.
7. Run `tools/fanya/browser/course-list.browser.js` when available, or use short visible page-state snippets.
8. Rank courses with `rankByNeedle()`.
9. If one high-confidence course exists, click it. If duplicate, near-duplicate, low-confidence, or ambiguous, list the top candidates and ask the user.
10. After clicking a course, run page-state and apply the same refresh-once recovery.
11. On the course assignment list page, prefer `browser-act state` to identify assignment cards and their visible `批阅` buttons. If `state` is too noisy, use only a very short inline eval that returns assignment titles, aggregate counts, and button/link targets. Do not use long ad hoc DOM-scanning evals on assignment lists; they are more likely to hit browser-act argument/logging failures.
12. Rank assignments with `rankByNeedle()`.
13. If one high-confidence assignment exists, enter its review list. If duplicate, near-duplicate, low-confidence, or ambiguous, ask the user.
14. After entering an assignment's student review list, switch to the roster workflow. Do not use raw `browser-act state` as the normal roster capture path because it can print private student data.
15. When the assignment review list is open and web roster data is needed, run `capture-web-roster.cjs` or `init-web-review.cjs` instead of dumping raw page state.
16. When rubric is missing, open one submitted student's review detail page as a read-only anchor and run `assignment-description.browser.js`.

Fallback: use the user's institution portal only when the direct Chaoxing entry cannot reach the expected course/account context. The user must navigate or confirm institution-specific portal entries manually.

## Assignment List Navigation

Treat the course assignment list and the student review roster as different privacy/tooling zones.

On the course assignment list page:

- `browser-act state` is acceptable because it normally shows assignment titles, class labels, due dates, and aggregate counts such as submitted/pending totals.
- Short inline eval is acceptable only when it returns a small assignment summary: title, work id/link/button target, visible aggregate counts, and no student rows.
- Avoid long generic DOM scans such as "return every matching `a,li,div,tr`"; these have repeatedly triggered browser-act long-eval/log permission errors.
- If the assignment list is visible in `state`, use the visible `批阅` element index from `state` instead of writing a custom eval.

After clicking an assignment's `批阅` button and entering the student review roster:

- Stop using raw `browser-act state` as the normal extraction path.
- Use `capture-web-roster.cjs --check-next-only` for pagination diagnostics.
- Use `init-web-review.cjs`, `capture-web-roster.cjs`, or `repair-task.cjs --browser-session` for structured roster/index work.
- These scripts may read student names/ids internally to build the temporary index, but they should print only aggregate or repair status to chat.

## Browser-Act Eval Snippets

Generate short inline snippets with:

```powershell
node tools/fanya/scripts/browser-eval-snippets.cjs page-state-lite
node tools/fanya/scripts/browser-eval-snippets.cjs assignment-review-summary
node tools/fanya/scripts/browser-eval-snippets.cjs student-detail-summary
node tools/fanya/scripts/browser-eval-snippets.cjs roster-page
```

Use them with:

```powershell
$script = node tools/fanya/scripts/browser-eval-snippets.cjs page-state-lite
browser-act --session <session> eval "$script"
```

For all-page roster capture after the assignment review list is open, use:

```powershell
node tools/fanya/scripts/capture-web-roster.cjs --session <browser-session> --course "<course>" --assignment "<assignment>" --out "tmp/session/web-roster.json"
```

Before relying on automatic roster pagination on a real page, run the non-clicking next-page diagnostic:

```powershell
node tools/fanya/scripts/capture-web-roster.cjs --session <browser-session> --check-next-only
```

It prints whether a next-page control exists and whether it appears disabled. It does not click. If this reports no usable next-page control on a multi-page roster, stop and inspect the page instead of running all-page capture.

For web-mode initialization after the assignment review list is open, use:

```powershell
node tools/fanya/scripts/init-web-review.cjs --session <browser-session> --course "<course>" --assignment "<assignment>" --rubric-path "<rubric.cjs>" --result-path "<result.cjs>" --sync-completed
```

## Recovery

- If the page is blank or still loading, refresh once. If it remains blank/loading, ask the user to confirm or manually reload.
- If SSO expires or page state is `login_required`, ask the user to log in manually and then rerun page-state.
- For local work, a headed browser window is enough for manual login. Use `remote-assist` only when the user needs remote/shared control; if `remote-assist` fails, fall back to a headed browser and manual login.
- If snippets return empty lists, inspect if content is inside a new window or inaccessible iframe.
- If duplicate or near-duplicate courses or assignments are returned, stop and ask the user to choose.
- Do not auto-click course/assignment candidates when `requireUserChoice()` returns true.
- If `browser-act eval` fails only for long snippets but short inline eval works, reduce returned text size and continue with short structured evals; record the failure before relying on that snippet.
- If a Node script that internally calls `browser-act` fails with `Permission denied: ... browseract/logs/.../main.log`, rerun that script with approved/non-sandbox permissions. This is a browser-act log write permission issue from the script's child process, not evidence that the Fanya roster/page parser is broken. Direct `browser-act` commands may still work because they run under the approved browser-act permission path.

