const INTERNAL_WORDING_PATTERN = /(?:\bcontact sheet\b|\bdraft\b|\bfirst-pass\b|needs review|high-score candidate|keep current score|formal grading should|score should be lower|复核|正式评分|正式评阅|当前分数|分数应|低档|高分候选|后台|流程)/iu;
const MOJIBAKE_PATTERN = /(?:�|锛|鈥|Ã|Â|鎴|娴|渚|涓|鍥|绋|庡|灏|姤|潰)/u;

function validateStudentFacingComment(comment) {
  const text = String(comment || "");
  if (INTERNAL_WORDING_PATTERN.test(text)) {
    throw new Error("student-facing comment must not include internal process wording");
  }
  if (MOJIBAKE_PATTERN.test(text)) {
    throw new Error("student-facing comment appears to contain mojibake");
  }
  return true;
}

function commentQualityIssues(comment) {
  const issues = [];
  const text = String(comment || "");
  if (INTERNAL_WORDING_PATTERN.test(text)) {
    issues.push({ code: "internal_process_wording", message: "Comment contains internal process wording." });
  }
  if (MOJIBAKE_PATTERN.test(text)) {
    issues.push({ code: "mojibake", message: "Comment appears to contain mojibake." });
  }
  return issues;
}

module.exports = {
  commentQualityIssues,
  validateStudentFacingComment,
};
