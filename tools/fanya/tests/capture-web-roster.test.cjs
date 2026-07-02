const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  checkNextPageControl,
  captureWebRoster,
  nextPageControlScript,
  parseBrowserActEval,
  rosterSummary,
  writeRosterJson,
} = require("../scripts/capture-web-roster.cjs");

test("captureWebRoster collects all roster pages and stops after the last page", async () => {
  const pages = [
    {
      rows: [
        { text: "20230001 Alpha Student Completed", cells: ["20230001", "Alpha Student", "Completed"], links: [] },
      ],
      pagination: { currentPage: 1, totalPages: 2, hasNext: true },
    },
    {
      rows: [
        { text: "20230002 Beta Student To be reviewed", cells: ["20230002", "Beta Student", "To be reviewed"], links: [] },
      ],
      pagination: { currentPage: 2, totalPages: 2, hasNext: false },
    },
  ];
  let pageIndex = 0;
  let nextClicks = 0;

  const result = await captureWebRoster({
    evaluatePage: async () => pages[pageIndex],
    nextPage: async () => {
      nextClicks += 1;
      pageIndex += 1;
    },
  });

  assert.equal(result.pageCount, 2);
  assert.equal(nextClicks, 1);
  assert.deepEqual(result.rows.map((row) => row.cells[0]), ["20230001", "20230002"]);
});

test("captureWebRoster reports a clear error when no browser session or evaluator is provided", async () => {
  await assert.rejects(
    () => captureWebRoster(),
    /browserSession or evaluatePage is required/,
  );
});

test("rosterSummary counts normalized roster statuses without exposing row text", () => {
  const summary = rosterSummary([
    { text: "20230001 Alpha Student Completed", cells: ["20230001", "Alpha Student", "Completed"], links: [] },
    { text: "20230002 Beta Student reformTo be reviewed", cells: ["20230002", "Beta Student", "reformTo be reviewed"], links: [] },
    { text: "local-003 Gamma Student Something Else", cells: ["local-003", "Gamma Student", "Something Else"], links: [] },
  ]);

  assert.deepEqual(summary, {
    totalStudents: 3,
    completed: 1,
    pending: 1,
    unknown: 1,
  });
});

test("writeRosterJson saves rows and aggregate metadata", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-roster-json-"));
  const outPath = path.join(root, "tmp", "session", "web-roster.json");

  writeRosterJson({
    rosterJsonPath: outPath,
    courseName: "Course A",
    assignmentName: "Assignment A",
    rows: [
      { text: "20230001 Alpha Student Completed", cells: ["20230001", "Alpha Student", "Completed"], links: [] },
    ],
    pageCount: 1,
  });

  const payload = JSON.parse(fs.readFileSync(outPath, "utf8"));
  assert.equal(payload.courseName, "Course A");
  assert.equal(payload.assignmentName, "Assignment A");
  assert.equal(payload.pageCount, 1);
  assert.equal(payload.rows.length, 1);
  assert.equal(payload.summary.completed, 1);
});

test("parseBrowserActEval accepts direct and wrapped eval output", () => {
  assert.deepEqual(parseBrowserActEval('{"rows":[],"pagination":{"hasNext":false}}'), {
    rows: [],
    pagination: { hasNext: false },
  });
  assert.deepEqual(parseBrowserActEval('{"ok":true,"value":"{\\"clicked\\":true}"}'), { clicked: true });
  assert.deepEqual(parseBrowserActEval('{"ok":true,"result":{"clicked":false}}'), { clicked: false });
});

test("nextPageControlScript uses multiple selectors and detects disabled controls", () => {
  const script = nextPageControlScript();
  assert.match(script, /#page li,.pagination li,a,button/);
  assert.match(script, /xl-nextPage/);
  assert.match(script, /disabled/);
  assert.doesNotMatch(script, /\.click\(/);
});

test("checkNextPageControl can run as a non-clicking diagnostic", async () => {
  const result = await checkNextPageControl({
    evaluateControl: async () => ({
      hasNextControl: true,
      disabled: false,
      clickable: true,
      text: "Next",
      className: "xl-nextPage",
    }),
  });

  assert.deepEqual(result, {
    hasNextControl: true,
    disabled: false,
    clickable: true,
    text: "Next",
    className: "xl-nextPage",
  });
});
