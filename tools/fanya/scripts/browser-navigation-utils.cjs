function normalizeNavText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

function rankByNeedle(candidates, needle) {
  const normalizedNeedle = normalizeNavText(needle);
  return (candidates || [])
    .map((candidate) => {
      const normalizedText = normalizeNavText(candidate.text || candidate.courseName || candidate.assignmentName || candidate.title || "");
      const matchScore = scoreMatch(normalizedText, normalizedNeedle);
      return { ...candidate, matchScore };
    })
    .filter((candidate) => candidate.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);
}

function scoreMatch(text, needle) {
  if (!text || !needle) return 0;
  if (text === needle) return 1;
  if (text.includes(needle)) return 0.9;
  if (needle.includes(text)) return 0.75;
  return commonPrefixRatio(text, needle) >= 0.6 ? 0.55 : 0;
}

function commonPrefixRatio(a, b) {
  const length = Math.min(a.length, b.length);
  let index = 0;
  while (index < length && a[index] === b[index]) index += 1;
  return length ? index / length : 0;
}

function requireUserChoice(ranked) {
  if (!ranked || ranked.length === 0) return true;
  if (ranked.length === 1) return ranked[0].matchScore < 0.85;
  return ranked[0].matchScore < 0.85 || Math.abs(ranked[0].matchScore - ranked[1].matchScore) < 0.05;
}

function retryDecision({ state, attempt, maxAttempts = 2 }) {
  if (state === "blank" || state === "loading" || state === "unknown") {
    return attempt < maxAttempts
      ? { action: "refresh", reason: "blank_or_loading" }
      : { action: "ask_user", reason: "blank_or_loading_after_retry" };
  }
  if (state === "login_required") {
    return { action: "ask_user", reason: "manual_login_required" };
  }
  return { action: "continue", reason: "page_ready" };
}

function classifyPageState({ url = "", text = "", readyState = "" }) {
  const rawText = String(text || "");
  const value = `${url} ${rawText}`.toLowerCase();
  if (!rawText.trim()) return "blank";
  if (readyState && readyState !== "complete") return "loading";
  if (/loading|\u52a0\u8f7d\u4e2d|\u8bf7\u7a0d\u5019|\u6b63\u5728\u52a0\u8f7d/.test(value)) return "loading";
  if (/login|password|captcha|sso|\u7edf\u4e00\u8ba4\u8bc1|\u767b\u5f55|\u5bc6\u7801|\u9a8c\u8bc1\u7801/.test(value)) return "login_required";
  if (/course list|\u8bfe\u7a0b/.test(value)) return "course_list";
  if (/personal space|\u4e2a\u4eba\u7a7a\u95f4/.test(value)) return "personal_space";
  if (/assignment|homework|\u4f5c\u4e1a/.test(value)) return "assignment_area";
  return "unknown";
}

module.exports = {
  classifyPageState,
  normalizeNavText,
  rankByNeedle,
  retryDecision,
  requireUserChoice,
};
