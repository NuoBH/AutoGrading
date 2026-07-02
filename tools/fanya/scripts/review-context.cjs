function validateReviewContext(expected, actual) {
  const mismatches = [];
  const syncNames = [];
  compareField("courseName", expected?.courseName, actual?.courseName, { mismatches, syncNames });
  compareField("assignmentName", expected?.assignmentName, actual?.assignmentName, { mismatches, syncNames });

  return {
    ok: mismatches.length === 0,
    action: mismatches.length > 0 ? "manual_select_required" : (syncNames.length > 0 ? "sync_names" : "continue"),
    mismatches,
    syncNames,
  };
}

function compareField(field, expectedValue, actualValue, result) {
  if (!expectedValue || !actualValue) return;
  if (normalizeContextName(expectedValue) === normalizeContextName(actualValue)) return;
  if (looseContextName(expectedValue) === looseContextName(actualValue)) {
    result.syncNames.push({
      field,
      expected: expectedValue,
      actual: actualValue,
      reason: "format_only",
    });
    return;
  }
  result.mismatches.push({
    field,
    expected: expectedValue,
    actual: actualValue,
  });
}

function normalizeContextName(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/gu, "")
    .replace(/[［\[]\s*/gu, "[")
    .replace(/\s*[］\]]/gu, "]")
    .toLowerCase();
}

function looseContextName(value) {
  return normalizeContextName(value)
    .replace(/[\p{P}\p{S}\s]+/gu, "");
}

module.exports = {
  looseContextName,
  normalizeContextName,
  validateReviewContext,
};
