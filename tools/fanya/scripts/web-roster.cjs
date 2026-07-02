const { saveStudentIndex } = require("./student-index.cjs");

function parseRosterRows(rows) {
  return (rows || [])
    .map((row, index) => parseRosterRow(row, index))
    .filter((student) => student.studentName || student.studentKey);
}

function saveRosterStudentIndex({ indexPath, courseName, assignmentName, rows, students }) {
  const parsedStudents = students || parseRosterRows(rows);
  return saveStudentIndex({
    indexPath,
    courseName,
    assignmentName,
    reviewMode: "web_download",
    source: "web_roster",
    students: parsedStudents.map((student) => {
      const output = {
        studentName: student.studentName,
        studentKey: student.studentKey,
        statusAtImport: student.status || "unknown",
      };
      if (student.reviewUrl) output.reviewUrl = student.reviewUrl;
      return output;
    }),
  });
}

function parseRosterRow(row, index) {
  const cells = Array.isArray(row?.cells) ? row.cells.map(cleanText).filter(Boolean) : [];
  const rawText = cleanText(row?.text || cells.join(" "));
  const links = Array.isArray(row?.links) ? row.links : [];
  const status = normalizeReviewStatus(rawText);
  const studentKey = extractStudentKey({ text: rawText, links }) || `local-${String(index + 1).padStart(3, "0")}`;
  const studentName = extractStudentName(cells, rawText, studentKey);

  return {
    studentName,
    studentKey,
    status,
    reviewUrl: firstReviewUrl(links),
    rawText,
  };
}

function normalizeReviewStatus(text) {
  const value = cleanText(text).toLowerCase().normalize("NFKC");
  const compact = value.replace(/\s+/g, "");

  if (
    compact.includes("\u5df2\u5b8c\u6210") ||
    compact.includes("\u5df2\u6279\u9605") ||
    /completed|complete/.test(compact)
  ) {
    return "completed";
  }

  if (
    compact.includes("\u91cd\u505a\u5f85\u6279\u9605") ||
    compact.includes("\u5f85\u6279\u9605") ||
    compact.includes("\u5f85\u8bc4\u9605") ||
    compact.includes("\u672a\u5b8c\u6210") ||
    /pending|todo|tobereviewed|reformtobereviewed|toreview/.test(compact)
  ) {
    return "pending";
  }

  return "unknown";
}

function browserExtractionScript() {
  return String.raw`(() => {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const rootDocument = (() => {
    const frames = Array.from(document.querySelectorAll("iframe"));
    for (const frame of frames) {
      try {
        const doc = frame.contentDocument;
        if (doc && /(?:\u59d3\u540d|\u5b66\u53f7|\u72b6\u6001|\u6279\u9605)/.test(doc.body?.innerText || "")) return doc;
      } catch (error) {}
    }
    return document;
  })();
  const chaoxingRows = Array.from(rootDocument.querySelectorAll("ul.dataBody_td"))
    .map((row) => ({
      text: clean(row.innerText),
      cells: Array.from(row.querySelectorAll("li")).map((cell) => clean(cell.innerText)).filter(Boolean),
      links: Array.from(row.querySelectorAll("a")).map((link) => ({
        text: clean(link.innerText),
        href: link.href,
        data: link.getAttribute("data") || "",
        onclick: link.getAttribute("onclick") || "",
        className: link.className || ""
      }))
    }))
    .filter((row) => row.text);
  if (chaoxingRows.length > 0) return { rows: chaoxingRows, pagination: paginationInfo(rootDocument) };

  const rows = Array.from(rootDocument.querySelectorAll("tr"))
    .map((row) => ({
      text: clean(row.innerText),
      cells: Array.from(row.querySelectorAll("th,td")).map((cell) => clean(cell.innerText)).filter(Boolean),
      links: Array.from(row.querySelectorAll("a[href]")).map((link) => ({
        text: clean(link.innerText),
        href: link.href,
        data: link.getAttribute("data") || "",
        onclick: link.getAttribute("onclick") || "",
        className: link.className || ""
      }))
    }))
    .filter((row) => row.text);
  if (rows.length > 0) return { rows, pagination: paginationInfo(rootDocument) };

  const cards = Array.from(rootDocument.querySelectorAll("[class*=student], [class*=stu], [class*=item], li"))
    .map((node) => ({
      text: clean(node.innerText),
      cells: [],
      links: Array.from(node.querySelectorAll("a[href]")).map((link) => ({
        text: clean(link.innerText),
        href: link.href,
        data: link.getAttribute("data") || "",
        onclick: link.getAttribute("onclick") || "",
        className: link.className || ""
      }))
    }))
    .filter((row) => row.text);
  return { rows: cards, pagination: paginationInfo(rootDocument) };

  function paginationInfo(doc) {
    const page = doc.querySelector("#page");
    if (!page) return { currentPage: 1, totalPages: 1, hasNext: false };
    const items = Array.from(page.querySelectorAll("li")).map((item) => ({
      text: clean(item.innerText),
      className: item.className || ""
    }));
    const numericPages = items.map((item) => Number(item.text)).filter((value) => Number.isFinite(value) && value > 0);
    const active = items.find((item) => /xl-active/.test(item.className));
    const next = items.find((item) => /xl-nextPage/.test(item.className));
    return {
      currentPage: Number(active?.text) || 1,
      totalPages: numericPages.length > 0 ? Math.max(...numericPages) : 1,
      hasNext: !!next && !/xl-disabled/.test(next.className)
    };
  }
})()`;
}

function extractStudentKey({ text, links }) {
  const textMatch = String(text || "").match(/\d{6,}/);
  if (textMatch) return textMatch[0];

  for (const link of links || []) {
    const href = `${link.data || ""} ${link.href || ""} ${link.onclick || ""}`;
    const queryMatch = href.match(/[?&](?:studentId|stuId|uid|userId|studentid|userid)=([^&#]+)/i);
    if (queryMatch) return decodeURIComponent(queryMatch[1]).trim();
    const answerMatch = href.match(/[?&]workAnswerId=([^&#]+)/i);
    if (answerMatch) return decodeURIComponent(answerMatch[1]).trim();
    const idMatch = href.match(/\d{6,}/);
    if (idMatch) return idMatch[0];
  }
  return "";
}

function extractStudentName(cells, rawText, studentKey) {
  const candidates = cells.length > 0 ? cells : cleanText(rawText).split(/\s+/);
  for (const candidate of candidates) {
    const value = cleanText(candidate);
    if (!value || value.includes(studentKey)) continue;
    if (/(?:\u5df2\u5b8c\u6210|\u5f85\u6279\u9605|\u5f85\u8bc4\u9605|\u5df2\u6279\u9605|completed|pending)/i.test(value)) continue;
    if (/^\d+$/.test(value)) continue;
    return value.replace(studentKey, "").trim();
  }
  return "";
}

function firstReviewUrl(links) {
  const reviewLink = (links || []).find((link) => /(?:\u6279\u9605|\u8bc4\u9605|review|\u67e5\u770b|\u8fdb\u5165|cz_py)/i.test(`${link.text || ""} ${link.href || ""} ${link.data || ""} ${link.className || ""}`));
  const target = reviewLink || links?.[0];
  return target?.data || target?.href || "";
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function main(argv) {
  if (argv[2] === "browser-script") {
    process.stdout.write(`${browserExtractionScript()}\n`);
    return;
  }
  throw new Error("Usage: web-roster.cjs browser-script");
}

if (require.main === module) {
  try {
    main(process.argv);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  browserExtractionScript,
  normalizeReviewStatus,
  parseRosterRows,
  saveRosterStudentIndex,
};
