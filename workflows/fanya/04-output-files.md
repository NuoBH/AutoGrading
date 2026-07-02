# 04 Output Files

Workflow documents stay as Markdown. Rubric and result data files do not.

## Canonical Data Files

New grading tasks use structured CommonJS object files:

```text
result/<course>-作业评价汇总-<date>.cjs
rubrics/<course>/<assignment>-rubric.cjs
```

Do not create new result or rubric Markdown files. Do not export Markdown just to read it again. The `.cjs` object files are the canonical data source.

## Result Record

Create a result record with:

```powershell
node tools/fanya/scripts/create-result.cjs --course "<course>" --assignment "<assignment>" --rubric-path "<rubric.cjs>"
```

Shape:

```js
module.exports = {
  schemaVersion: 1,
  kind: "fanya_result",
  courseName: "...",
  gradingRules: ["..."],
  assignments: [
    {
      assignmentName: "...",
      rubricPath: "rubrics/.../assignment-rubric.cjs",
      assignmentSummary: "...",
      reviews: [
        {
          studentName: "...",
          studentKey: "20230001",
          status: "reviewed",
          submissionSummary: "video/pdf/images",
          suggestedScore: 88,
          comment: "Personalized 2-3 sentence review",
          statusReason: ""
        }
      ],
      draftReviews: [
        {
          studentName: "...",
          studentKey: "20230001",
          status: "draft",
          source: "contact_sheet_first_pass",
          suggestedScore: 84,
          comment: "Personalized 2-3 sentence draft comment"
        }
      ]
    }
  ]
};
```

Review statuses:

```text
reviewed       -> completedStudentKeys
manual_review  -> completedStudentKeys
skipped        -> skippedStudentKeys
```

For runtime navigation only, `completedStudentKeys + skippedStudentKeys` is treated as the handled set.

`draftReviews` are first-pass artifacts only. They do not count as handled, completed, skipped, or final grades. Resume treats draft-only students as pending. Repair preserves/remaps drafts when possible, but promotion must validate that every draft `studentKey` exists in the current student index before writing formal `reviews`.

`statusReason` examples:

```text
user_skipped
already_completed_on_website
cannot_open_attachment
missing_attachment
manual_review
```

When writing a review, never overwrite an existing review with the same `studentKey`. Return or report that the student already has a record.

## Rubric Record

Rubrics are also structured records:

```js
module.exports = {
  schemaVersion: 1,
  kind: "fanya_rubric",
  courseName: "...",
  assignmentName: "...",
  status: "confirmed",
  assignmentSummary: "...",
  dimensions: [
    {
      name: "Completeness",
      points: 20,
      criteria: "..."
    }
  ],
  scoreBands: [
    { range: "90-100", meaning: "excellent, rare" },
    { range: "80-89", meaning: "ordinary to good, most work" },
    { range: "70-79", meaning: "medium or major issues" },
    { range: "0-69", meaning: "major issues or perfunctory" }
  ]
};
```

Every assignment rubric must be confirmed by the user before any student review starts.

## Session File

The session file remains temporary state:

```text
tmp/session/fanya-current-task.json
tmp/session/fanya-current-student-index.json
```

It records current mode, source paths, and progress:

```text
courseName
assignmentName
reviewMode
rubricPath
resultPath
reviewSourcePath
studentIndexPath
sourceZip
studentsDir
currentStudentKey
completedStudentKeys
skippedStudentKeys
```

The student index file is a temporary roster/import snapshot used for skipped-name matching and quick inspection:

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

For `bundle_zip`, `source` is `bundle_students_dir` and every `statusAtImport` is `pending`. For `web_download`, `statusAtImport` is the roster status at extraction time, such as `pending`, `completed`, or `unknown`; `reviewUrl` is web-only and should be omitted for `bundle_zip`.

The result record is the long-term source of truth. After the assignment is complete and cleanup has run, `task-session.cjs clear` removes the current session file and temporary student index file. Keep the `tmp/session/` directory.

## Final Excel Export

After reviews are final, export the teacher-facing workbook from the result record:

```powershell
node tools/fanya/scripts/export-result-xlsx.cjs --result-path "<result.cjs>" --out-dir "outputs"
```

Recommended finishing sequence:

```powershell
node tools/fanya/scripts/export-result-xlsx.cjs --result-path "<result.cjs>" --out-dir "outputs" --dry-run
node tools/fanya/scripts/export-result-xlsx.cjs --result-path "<result.cjs>" --out-dir "outputs"
```

Rules:

- The Excel workbook is local output only; do not upload scores or write anything back to Fanya/Chaoxing.
- One result file exports to one workbook.
- If the result file contains multiple assignments, each assignment becomes a separate worksheet.
- Default workbook columns are `学生姓名`, `学号/编号`, `分数`, and `评语`.
- `draftReviews` are excluded by default. Use `--include-drafts` only for QA, not final teacher submission.
- Command output prints aggregate counts and validation issues only. It must not print student names, ids, scores, or comments.

