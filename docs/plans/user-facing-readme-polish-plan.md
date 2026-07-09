# User-Facing README Polish Plan

## Goal

Make the public-facing documentation feel like it is written for teachers, teaching assistants, and course staff who want to reduce repetitive grading work.

The first few seconds of reading should answer:

- What problem does this solve?
- Is this useful for my kind of assignments?
- What do I need to do?
- What will the tool do for me?
- Is it safe for student data and platform grades?

This plan is documentation-only. It should not change core grading scripts unless a documentation inconsistency reveals a real workflow bug.

Important source-of-truth rule:

> The agent workflow, wizard output, resume output, and scripts are the execution source of truth. README, FAQ, and demo pages must describe that behavior in user-friendly language. Do not change workflow docs merely to match a nicer README phrase; change README wording to match the real workflow.

## Main Audience

Primary audience:

- Teachers or teaching assistants using Fanya / Chaoxing.
- Courses with visual, design, video, media, PDF, PPT, report, source-file, or mixed-submission assignments.
- Users who want local review records and Excel export without manually opening every attachment.

Secondary audience:

- Users with text/document-heavy assignments who can benefit from the assignment-level text bundle.
- Developers or agents maintaining the workflow, but they should not be the primary voice of the README.

## Current Issues

### 1. README still has some non-user-facing language

Some parts describe internal workflow concepts before clearly explaining the user benefit.

Examples of wording to avoid in user-facing docs:

- backend-style terms without explanation;
- long lists of process obligations;
- wording that sounds like instructions to an agent rather than reassurance to a user;
- implementation-level details too early in the README.

Backend terms can still appear when useful, but they should be introduced with plain-language labels first.

Suggested plain-language mapping:

| Internal Term | User-Facing Phrase |
| --- | --- |
| `bundle_zip` | 压缩包批阅模式 |
| `web_download` | 网页批阅模式 |
| `rubric` | 评分标准文件 |
| `result` | 评阅记录文件 |
| `contact sheet` | 作品总览图 |
| `review-text.md` | 单个学生的文本评阅材料 |
| `assignment-review-text.md` | 全班文字评阅包 |
| `draftReviews` | 草稿评阅 |
| `promote` | 转为正式评阅 |

### 2. “它能帮你做什么” is too long

The section currently lists many details, which is accurate but not punchy enough.

It should start with a one-sentence value proposition:

> 它帮你把分散、混乱、格式各异的学生附件，变成可批量浏览、可复核、可导出表格的本地评阅流程。

Then use short bullets for concrete capabilities.

Suggested bullets:

- 整理学生名单和附件，减少手动解压、查找、重命名。
- 从视频抽帧，从 PDF 提取文字或页面，从 Word/PPT/文本文件提取可读内容。
- 为视觉类作业生成作品总览图，为文档类作业生成全班文字评阅包。
- 辅助生成建议分数和学生可读评语。
- 导出 Excel，并保留本地评阅记录，方便检查、修改和续评。

### 3. “获取这个项目” should appear before setup

The README should not ask users to run setup commands before telling them how to get the repository.

Recommended order:

1. What this tool is.
2. Who it is for.
3. Demo / quick effect.
4. Get the project.
5. First-time setup and environment check.
6. Quick start with the two modes.
7. Where files go.
8. Other notes.

### 4. “你负责什么，工具负责什么” feels like the user does too much

This section should reduce perceived workload.

Rename it to:

> 你主要负责确认，工具负责重复劳动

User side should be framed as confirmations, not chores:

- 放入作业压缩包，或登录网页。
- 确认课程、作业和评分标准。
- 确认是否有跳过学生、是否同步网页已完成状态。
- 确认草稿评阅是否转为正式评阅，是否导出 Excel。

Tool side should emphasize labor reduction:

- 解压、整理学生附件和学生名单。
- 准备视频帧、PDF 文字/页面、文档文本和图片证据。
- 生成作品总览图或全班文字评阅包。
- 按评分标准辅助生成建议分数和学生可读评语。
- 写入本地评阅记录并导出 Excel。

### 5. Later sections should be grouped under “Other Notes”

The back half of README currently contains several detailed explanatory sections.

Keep them, but group them under a larger section:

```md
## 其他说明

### 作品总览图是什么

### 文字 / 文档类作业怎么批阅

### 快速批阅如何变成正式结果

### 评分标准和评语质量

### 安全边界
```

This makes the README easier to scan and prevents detailed explanations from competing with the main quick-start content.

### 6. Add more breathing room

The README should use more blank lines between major sections, especially before headings and after short introductory paragraphs.

The goal is not to make the file longer, but to make it feel less dense.

### 7. Fix two README wording discrepancies found in workflow audit

The workflow currently says:

- `text_document` bundle tasks use `prepare-bundle-evidence.cjs` and `build-assignment-review-text.cjs`, not contact sheet by default.
- `mixed_doc_visual` bundle tasks may use both assignment-level text bundle and contact sheet.
- Both paths produce first-pass draft reviews that require dry-run readiness check and user confirmation before promotion.

README should not imply that `assignment-review-text.md` itself becomes final review output.

Replace wording like:

> 确认作品总览图草稿或全班文字评阅结果是否可以转为正式评阅

With:

> 确认基于作品总览图或全班文字评阅包生成的草稿评阅是否可以转为正式评阅

Also replace wording that frames fast review as visual-only:

> 视觉类和混合作业会默认使用快速批阅

With:

> 压缩包批阅模式会按评分标准选择快速批阅路径：视觉/视频/混合作业通常用作品总览图，纯文字/文档作业通常用全班文字评阅包。

## Text / Document Assignment Messaging

The wording for pure text and document-heavy assignments should be consistent across README, FAQ, demo, and workflow docs.

Recommended user-facing explanation:

1. Pure text/document assignments usually do not use the visual contact sheet by default.
2. The tool first creates each student's `review-text.md`.
3. In bundle mode, it can combine pending students into `assignment-review-text.md`, the 全班文字评阅包.
4. The text bundle is for first-pass reading, comparison, and draft scoring.
5. It is not an automatic final scoring mechanism.
6. If text is missing, garbled, truncated, or the score band is unclear, open the student's original file or evidence folder.
7. Mixed document/visual assignments may use both:
   - text bundle for reports, explanations, reflections, written analysis;
   - contact sheet for images, video frames, page layout, slides, renders, diagrams, or PDF page appearance.

Avoid saying:

> 工具不会把全班文档合并成一个大文件批量评分。

This is now misleading because the project can build an assignment-level text bundle.

Better:

> 全班文字评阅包用于批量阅读和草稿分档，不是自动一次性决定最终分数。

## File-Level Plan

### README.md

Primary rewrite target.

Planned changes:

- Strengthen the opening value proposition.
- Move “获取这个项目” before “使用前准备”.
- Rewrite “它能帮你做什么” with a one-sentence pain-point summary and shorter bullets.
- Rename and reframe “你负责什么，工具负责什么”.
- Add or keep clear explanations of:
  - 压缩包批阅模式;
  - 网页批阅模式;
  - 作品总览图;
  - 全班文字评阅包;
  - 草稿评阅转正式评阅;
  - local-only safety boundary.
- Group later explanatory sections under “其他说明”.
- Add blank lines around sections for readability.

### docs/demo.md

Keep as a short fictional walkthrough, not a technical spec.

Planned changes:

- Ensure the intro is user-facing and promotional but accurate.
- Mention the text/document path briefly:
  - pure text/document assignments use the text bundle rather than the visual contact sheet by default;
  - mixed assignments may use both.
- Keep the safety point:
  - rubric first;
  - real student index;
  - draft first;
  - user confirms before final records.

### docs/faq.md

Keep answers short and reassuring.

Planned changes:

- Update the pure-text answer so it does not conflict with `assignment-review-text.md`.
- Emphasize local-only behavior and no online grade submission.
- Avoid backend-heavy language unless paired with plain explanations.

### workflows/fanya-homework-review.md

Only update if needed for consistency with actual script behavior.

This file is agent-facing, not promotional.

Do not edit this file just to mirror README wording. It should remain an execution guide.

Possible change only if the actual workflow text is stale:

- Ensure the high-level workflow says bundle fast review may use:
  - contact sheets;
  - video-first / multi-slot contact sheets;
  - assignment-level text bundles.

### workflows/fanya/02-assignment-rubric.md

Only update if needed for rubric-generation accuracy.

Possible change:

- Ensure rubric instructions tell agents:
  - use `text_document` for pure text/document assignments;
  - use `mixed_doc_visual` for mixed document + visual assignments;
  - do not recommend contact-sheet drafts for pure text unless layout/image/PDF appearance matters;
  - use assignment-level text bundle as first-pass evidence when relevant.

### workflows/fanya/03-student-review.md

Only update if needed for execution clarity.

Possible change:

- Ensure it clearly states:
  - pure text/document fast-bundle path is `prepare-bundle-evidence -> build-assignment-review-text -> draftReviews -> dry-run -> user confirm -> promote`;
  - mixed document/visual assignments should use both text bundle and contact sheet when rubric says both matter.

## Source Of Truth And Workflow Docs

README is for users. Workflow docs are for agents and future maintainers.

The workflow docs and scripts are the source of truth for execution. README should be polished to describe that real behavior accurately.

Workflow docs should be updated only when they are stale or incomplete relative to the actual script behavior.

Current behavior to preserve:

- Pure text/document bundle tasks use `assignment-review-text.md` for first-pass batch review and do not use contact-sheet drafts by default.
- Mixed document/visual bundle tasks may use both `assignment-review-text.md` and contact sheet.
- Visual/video/image/PDF-page tasks use contact sheet when rubric says visual evidence matters.
- Drafts require dry-run readiness summary and user confirmation before promotion.

If README and workflow disagree, fix README first unless the workflow is demonstrably stale.

So workflow updates are not part of user-facing polish by default. They are guardrails and should stay precise, concise, and agent-facing.

## Non-Goals

- Do not rewrite backend scripts.
- Do not change grading logic.
- Do not change result/rubric file formats.
- Do not add new screenshots or GIFs in this pass unless the README wording requires them.
- Do not put private student/course/account information into docs.
- Do not make README sound like a developer handoff document.

## Verification Plan

Because this is documentation-only, code tests are not required unless workflow commands are changed.

Run these checks:

```powershell
rg -n "不是把全班文本合并|逐个查看文本评阅材料|review-text.md primaryFiles|TODO|TBD" README.md docs/faq.md docs/demo.md workflows
```

Expected:

- No stale wording that contradicts assignment-level text bundles.
- No TODO/TBD placeholders.

Review the top of README:

```powershell
Get-Content -LiteralPath README.md -Encoding utf8 | Select-Object -First 120
```

Expected:

- The opening explains the pain point quickly.
- The target audience is clear.
- The repo acquisition section appears before setup.
- The first 120 lines are understandable to a non-developer user.

Review diff:

```powershell
git diff -- README.md docs/demo.md docs/faq.md workflows/fanya-homework-review.md workflows/fanya/02-assignment-rubric.md workflows/fanya/03-student-review.md
```

Expected:

- README becomes more user-facing.
- FAQ and demo remain concise.
- Workflow docs only change where behavior alignment is needed.

## Suggested Execution Order

1. Edit README structure and opening.
2. Rewrite “它能帮你做什么”.
3. Rewrite “你主要负责确认，工具负责重复劳动”.
4. Group later README sections under “其他说明”.
5. Fix README wording so text bundle-based draft reviews, not the text bundle itself, are what gets promoted.
6. Fix README wording so fast-bundle includes text/document paths, not only visual/mixed paths.
7. Update FAQ pure-text answer.
8. Update demo text/document explanation.
9. Check workflow docs only for actual staleness against wizard/resume/script behavior.
10. Run documentation grep checks.
11. Review `git diff`.
