const {
  appendStudentReview,
  createResultRecordFile,
  extractCompletedStudentKeys,
  extractHandledStudentKeys,
  extractSkippedStudentKeys,
} = require("./record-store.cjs");

function createResultFile(options) {
  return createResultRecordFile(options);
}

function appendSkippedReviews({ resultPath, assignmentName, students }) {
  const appended = [];
  for (const student of students || []) {
    if (!student?.studentKey) continue;
    const result = appendStudentReview({
      resultPath,
      assignmentName,
      review: {
        studentName: student.studentName || "",
        studentKey: student.studentKey,
        status: "skipped",
        submissionSummary: "-",
        suggestedScore: null,
        comment: "\u5df2\u8df3\u8fc7",
        statusReason: "user_skipped",
      },
    });
    if (result.appended) appended.push(student.studentKey);
  }
  return { appended };
}

function appendAlreadyCompletedReviews({ resultPath, assignmentName, students }) {
  const appended = [];
  for (const student of students || []) {
    if (!student?.studentKey) continue;
    const result = appendStudentReview({
      resultPath,
      assignmentName,
      review: {
        studentName: student.studentName || "",
        studentKey: student.studentKey,
        status: "reviewed",
        submissionSummary: "-",
        suggestedScore: null,
        comment: "\u7f51\u9875\u663e\u793a\u5df2\u5b8c\u6210\uff0c\u672a\u91cd\u65b0\u8bc4\u9605\u3002",
        statusReason: "already_completed_on_website",
      },
    });
    if (result.appended) appended.push(student.studentKey);
  }
  return { appended };
}

module.exports = {
  appendAlreadyCompletedReviews,
  appendSkippedReviews,
  createResultFile,
  extractCompletedStudentKeys,
  extractHandledStudentKeys,
  extractSkippedStudentKeys,
};
