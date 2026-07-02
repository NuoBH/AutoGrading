# 01 Login And Course Entry

Goal: enter the target course page so assignment descriptions and student review lists can be read.

## Required Inputs

Before opening the course list, ask for the course name. The course name is used to:

- Find the course in the website.
- Create `rubrics/<course>/`.
- Create `result/<course>-作业评价汇总-<date>.cjs`.

Also ask for assignment scope and review mode when available.

## Browser And Login

Use the confirmed browser session. If the site is not logged in, pause and let the user log in manually.

Never enter account, password, CAPTCHA, SMS, or MFA information.

Use `00-browser-navigation.md` helpers after manual login. Prefer snippet extraction for visible entries and course lists instead of describing the whole page in chat.

## Entry URL

Start from:

```text
https://i.chaoxing.com/
```

Default Chaoxing login flow:

1. Let the user log in.
2. Open `课程`.
3. Open the user-confirmed course.

Fallback institution-portal flow, only if direct Chaoxing entry cannot reach the expected course/account context:

1. Ask the user for their institution portal URL, or let the user open it manually.
2. Let the user log in.
3. Ask the user to choose the portal entry that leads to Chaoxing/Fanya if multiple education apps are visible.
4. Enter the user's personal/course space.
5. Open `课程`.
6. Open the user-confirmed course.

If direct Chaoxing or fallback portal loading fails or the SSO ticket expires, refresh once or reopen the entry. If duplicate or similar course names appear, list the visible choices and ask the user to choose. A current course and an ended course with the same name should be treated as ambiguous unless the user already confirmed which one to use.

## Course Verification

Before continuing, verify that the page shows the intended course title and an assignment entry. If the page is blank, still in SSO, or ambiguous, pause and ask the user to confirm.
