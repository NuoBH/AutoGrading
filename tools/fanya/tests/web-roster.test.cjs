const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  browserExtractionScript,
  normalizeReviewStatus,
  parseRosterRows,
  saveRosterStudentIndex,
} = require("../scripts/web-roster.cjs");

test("normalizeReviewStatus recognizes completed and pending states", () => {
  assert.equal(normalizeReviewStatus("\u5b66\u751f\u4f5c\u4e1a \u5df2\u5b8c\u6210"), "completed");
  assert.equal(normalizeReviewStatus("\u5df2\u5b8c\u6210\uff08\u8865\u4ea4\uff09"), "completed");
  assert.equal(normalizeReviewStatus("Completed\uff08Supplementary\uff09"), "completed");
  assert.equal(normalizeReviewStatus("\u72b6\u6001\uff1a\u5f85\u6279\u9605"), "pending");
  assert.equal(normalizeReviewStatus("\u5f85\u6279\u9605\uff08\u8865\u4ea4\uff09"), "pending");
  assert.equal(normalizeReviewStatus("\u91cd\u505a\u5f85\u6279\u9605\uff08\u8865\u4ea4\uff09"), "pending");
  assert.equal(normalizeReviewStatus("To be reviewed"), "pending");
  assert.equal(normalizeReviewStatus("To be reviewed\uff08Supplementary\uff09"), "pending");
  assert.equal(normalizeReviewStatus("reformTo be reviewed"), "pending");
  assert.equal(normalizeReviewStatus("TO BE REVIEWED"), "pending");
  assert.equal(normalizeReviewStatus("to     bE     rEVIewed"), "pending");
  assert.equal(normalizeReviewStatus("reform   To   be   reviewed"), "pending");
  assert.equal(normalizeReviewStatus("tobereviewed"), "pending");
  assert.equal(normalizeReviewStatus("reformTobereviewed"), "pending");
  assert.equal(normalizeReviewStatus("\u65e0\u72b6\u6001"), "unknown");
});

test("parseRosterRows extracts student identity, status, and review link", () => {
  const students = parseRosterRows([
    {
      cells: ["20230001", "Alpha", "\u5df2\u5b8c\u6210", "\u6279\u9605"],
      text: "20230001 Alpha \u5df2\u5b8c\u6210 \u6279\u9605",
      links: [{ text: "\u6279\u9605", href: "https://example.test/review?studentId=20230001" }],
    },
    {
      cells: ["Beta", "\u5f85\u6279\u9605"],
      text: "Beta \u5f85\u6279\u9605",
      links: [{ text: "\u8fdb\u5165", href: "https://example.test/review?uid=20230002" }],
    },
  ]);

  assert.deepEqual(students.map((student) => ({
    studentName: student.studentName,
    studentKey: student.studentKey,
    status: student.status,
    reviewUrl: student.reviewUrl,
  })), [
    {
      studentName: "Alpha",
      studentKey: "20230001",
      status: "completed",
      reviewUrl: "https://example.test/review?studentId=20230001",
    },
    {
      studentName: "Beta",
      studentKey: "20230002",
      status: "pending",
      reviewUrl: "https://example.test/review?uid=20230002",
    },
  ]);
});

test("parseRosterRows handles Chaoxing homework review rows", () => {
  const students = parseRosterRows([
    {
      cells: ["Alpha", "999000001", "06-09 17:40", "203.0.113.10", "\u5f85\u6279\u9605", "\u6279\u9605 \u6253\u56de"],
      text: "Alpha 999000001 06-09 17:40 203.0.113.10 \u5f85\u6279\u9605 \u6279\u9605 \u6253\u56de",
      links: [
        {
          text: "\u6279\u9605",
          href: "javascript:;",
          data: "/mooc2-ans/work/library/review-work?workAnswerId=55551147&pages=1&size=20",
          className: "cz_py",
        },
      ],
    },
  ]);

  assert.equal(students[0].studentName, "Alpha");
  assert.equal(students[0].studentKey, "999000001");
  assert.equal(students[0].status, "pending");
  assert.equal(students[0].reviewUrl, "/mooc2-ans/work/library/review-work?workAnswerId=55551147&pages=1&size=20");
});

test("browserExtractionScript returns iframe-aware roster and pagination logic", () => {
  const script = browserExtractionScript();
  assert.match(script, /contentDocument/);
  assert.match(script, /ul\.dataBody_td/);
  assert.match(script, /paginationInfo/);
  assert.match(script, /\\u59d3\\u540d/);
});

test("saveRosterStudentIndex writes web roster statuses as statusAtImport", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-web-index-"));
  const indexPath = path.join(root, "tmp", "session", "fanya-current-student-index.json");

  const index = saveRosterStudentIndex({
    indexPath,
    courseName: "Course",
    assignmentName: "Assignment",
    rows: [
      {
        cells: ["20230001", "Alpha", "Completed"],
        text: "20230001 Alpha Completed",
        links: [{ text: "\u6279\u9605", href: "https://example.test/review?studentId=20230001" }],
      },
      {
        cells: ["20230002", "Beta", "To be reviewed"],
        text: "20230002 Beta To be reviewed",
        links: [{ text: "\u6279\u9605", href: "https://example.test/review?studentId=20230002" }],
      },
    ],
  });

  assert.equal(index.reviewMode, "web_download");
  assert.deepEqual(JSON.parse(fs.readFileSync(indexPath, "utf8")).students, [
    {
      studentName: "Alpha",
      studentKey: "20230001",
      statusAtImport: "completed",
      reviewUrl: "https://example.test/review?studentId=20230001",
    },
    {
      studentName: "Beta",
      studentKey: "20230002",
      statusAtImport: "pending",
      reviewUrl: "https://example.test/review?studentId=20230002",
    },
  ]);
});
