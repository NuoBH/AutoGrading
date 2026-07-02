const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { browserExtractionScript, parseRosterRows } = require("./web-roster.cjs");

const DEFAULT_ROSTER_JSON_PATH = path.join("tmp", "session", "web-roster.json");

async function captureWebRoster(options = {}) {
  const evaluatePage = options.evaluatePage || browserActRosterEvaluator(options);
  const nextPage = options.nextPage || browserActNextPage(options);
  const maxPages = Number(options.maxPages || 50);
  const rows = [];
  const pages = [];

  if (!evaluatePage) {
    throw new Error("browserSession or evaluatePage is required");
  }

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const payload = normalizeRosterPayload(await evaluatePage({ pageIndex }));
    rows.push(...payload.rows);
    pages.push({
      pageIndex: pageIndex + 1,
      rowCount: payload.rows.length,
      pagination: payload.pagination,
    });

    if (!payload.pagination.hasNext) break;
    if (!nextPage) throw new Error("nextPage is required when roster pagination has a next page");
    const moved = await nextPage({ pageIndex, pagination: payload.pagination });
    if (moved === false) throw new Error("Failed to move to the next roster page");
  }

  return { rows, pageCount: pages.length, pages, summary: rosterSummary(rows) };
}

async function checkNextPageControl(options = {}) {
  const evaluateControl = options.evaluateControl || browserActNextPageControlEvaluator(options);
  if (!evaluateControl) throw new Error("browserSession or evaluateControl is required");
  return evaluateControl();
}

function normalizeRosterPayload(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.rows;
  const pagination = payload?.pagination || {};
  return {
    rows: rows || [],
    pagination: {
      currentPage: Number(pagination.currentPage) || 1,
      totalPages: Number(pagination.totalPages) || 1,
      hasNext: !!pagination.hasNext,
    },
  };
}

function rosterSummary(rows) {
  const students = parseRosterRows(rows);
  return {
    totalStudents: students.length,
    completed: students.filter((student) => student.status === "completed").length,
    pending: students.filter((student) => student.status === "pending").length,
    unknown: students.filter((student) => student.status === "unknown").length,
  };
}

function writeRosterJson({ rosterJsonPath = DEFAULT_ROSTER_JSON_PATH, courseName = "", assignmentName = "", rows = [], pageCount = 0 }) {
  const payload = {
    schemaVersion: 1,
    courseName,
    assignmentName,
    source: "web_roster",
    capturedAt: new Date().toISOString(),
    pageCount,
    summary: rosterSummary(rows),
    rows,
  };
  fs.mkdirSync(path.dirname(rosterJsonPath), { recursive: true });
  fs.writeFileSync(rosterJsonPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

function browserActRosterEvaluator(options) {
  if (!options.browserSession) return null;
  return async () => parseBrowserActEval(runBrowserActEval(options.browserSession, stringifyEvalScript(browserExtractionScript())));
}

function browserActNextPage(options) {
  if (!options.browserSession) return null;
  return async () => {
    const result = parseBrowserActEval(runBrowserActEval(options.browserSession, stringifyEvalScript(nextPageScript())));
    if (result.clicked) {
      waitForBrowser(options.browserSession);
      return true;
    }
    return false;
  };
}

function browserActNextPageControlEvaluator(options) {
  if (!options.browserSession) return null;
  return async () => parseBrowserActEval(runBrowserActEval(options.browserSession, stringifyEvalScript(nextPageControlScript())));
}

function stringifyEvalScript(script) {
  return `JSON.stringify(${script})`;
}

function runBrowserActEval(session, script) {
  return execFileSync("browser-act", ["--session", session, "eval", script], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function waitForBrowser(session) {
  execFileSync("browser-act", ["--session", session, "wait", "stable", "--timeout", "30000"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
}

function parseBrowserActEval(stdout) {
  const parsed = parseJsonLoose(stdout);
  if (parsed?.ok === true && Object.hasOwn(parsed, "value")) return parseValue(parsed.value);
  if (parsed?.ok === true && Object.hasOwn(parsed, "result")) return parseValue(parsed.result);
  return parseValue(parsed);
}

function parseValue(value) {
  if (typeof value === "string") return parseJsonLoose(value);
  return value;
}

function parseJsonLoose(value) {
  const text = String(value || "").trim();
  try {
    return JSON.parse(text);
  } catch {}
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return JSON.parse(text.slice(first, last + 1));
  throw new Error("Could not parse browser-act eval output as JSON");
}

function nextPageControlScript() {
  return String.raw`(()=>{const C=v=>String(v||'').replace(/\s+/g,' ').trim(),D=[document].concat([...document.querySelectorAll('iframe')].map(f=>{try{return f.contentDocument}catch(e){return null}}).filter(Boolean)),d=D.find(x=>/(\u59d3\u540d|\u5b66\u53f7|\u72b6\u6001|\u6279\u9605)/.test(x.body?.innerText||''))||document,n=[...d.querySelectorAll('#page li,.pagination li,a,button')].find(i=>/xl-nextPage|next|\u4e0b\u4e00\u9875/i.test((i.className||'')+' '+C(i.innerText)+' '+(i.getAttribute('aria-label')||'')));const cls=n?.className||'',disabled=!!n&&(/disabled|xl-disabled/i.test(cls)||n.getAttribute('aria-disabled')==='true'||n.disabled===true);return {hasNextControl:!!n,disabled,clickable:!!n&&!disabled,text:C(n?.innerText),className:cls}})()`;
}

function nextPageScript() {
  return String.raw`(()=>{const C=v=>String(v||'').replace(/\s+/g,' ').trim(),D=[document].concat([...document.querySelectorAll('iframe')].map(f=>{try{return f.contentDocument}catch(e){return null}}).filter(Boolean)),d=D.find(x=>/(\u59d3\u540d|\u5b66\u53f7|\u72b6\u6001|\u6279\u9605)/.test(x.body?.innerText||''))||document,n=[...d.querySelectorAll('#page li,.pagination li,a,button')].find(i=>/xl-nextPage|next|\u4e0b\u4e00\u9875/i.test((i.className||'')+' '+C(i.innerText)+' '+(i.getAttribute('aria-label')||'')));const cls=n?.className||'',disabled=!!n&&(/disabled|xl-disabled/i.test(cls)||n.getAttribute('aria-disabled')==='true'||n.disabled===true);if(n&&!disabled){n.click();return {clicked:true,control:{hasNextControl:true,disabled:false,text:C(n.innerText),className:cls}}}return {clicked:false,control:{hasNextControl:!!n,disabled,text:C(n?.innerText),className:cls}}})()`;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--check-next-only") {
      args.checkNextOnly = true;
      continue;
    }
    if (!key?.startsWith("--")) continue;
    const argName = key.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    args[argName] = value;
    index += 1;
  }
  return args;
}

async function main(argv) {
  const args = parseArgs(argv);
  if (!args.session) throw new Error("Usage: capture-web-roster.cjs --session <browser-session> [--out <web-roster.json>] [--course <course>] [--assignment <assignment>] [--check-next-only]");
  if (args.checkNextOnly) {
    const result = await checkNextPageControl({ browserSession: args.session });
    process.stdout.write(`${JSON.stringify({ status: "checked_next", ...result }, null, 2)}\n`);
    return;
  }
  const captured = await captureWebRoster({
    browserSession: args.session,
    maxPages: args.maxPages,
  });
  const payload = writeRosterJson({
    rosterJsonPath: args.out || args.rosterJson || DEFAULT_ROSTER_JSON_PATH,
    courseName: args.course || "",
    assignmentName: args.assignment || "",
    rows: captured.rows,
    pageCount: captured.pageCount,
  });
  process.stdout.write(`${JSON.stringify({
    status: "captured",
    rosterJsonPath: args.out || args.rosterJson || DEFAULT_ROSTER_JSON_PATH,
    pageCount: payload.pageCount,
    summary: payload.summary,
  }, null, 2)}\n`);
}

if (require.main === module) {
  main(process.argv).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_ROSTER_JSON_PATH,
  checkNextPageControl,
  captureWebRoster,
  nextPageControlScript,
  nextPageScript,
  parseBrowserActEval,
  rosterSummary,
  writeRosterJson,
};
