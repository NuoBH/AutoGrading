const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");

const { sanitizePathPart } = require("./attachment-utils.cjs");

function selectDownloadUrl(attachment) {
  if (attachment.actions?.includes("mark_manual_review")) return "";
  return attachment.fallbackUrl || attachment.previewUrl || attachment.primaryUrl || "";
}

function targetFilename(attachment, index) {
  const rawName = attachment.filename || `attachment-${index + 1}`;
  const safeName = sanitizePathPart(rawName);
  return `${String(index + 1).padStart(2, "0")}-${safeName}`;
}

function buildDownloadJobs(plan) {
  const tmpDir = plan.tmpDir || "tmp/work-unknown/student-unknown";
  return (plan.attachments ?? []).map((attachment, index) => {
    const url = selectDownloadUrl(attachment);
    return {
      index,
      objectid: attachment.objectid || "",
      filename: attachment.filename || "",
      kind: attachment.kind || "other",
      url,
      targetPath: path.join(tmpDir, targetFilename(attachment, index)),
      status: url ? "pending" : "manual_review",
      reason: url ? "" : "no downloadable URL or attachment marked manual review",
    };
  });
}

async function downloadJob(job, options = {}) {
  if (!job.url) return { ...job, status: "manual_review" };
  fs.mkdirSync(path.dirname(job.targetPath), { recursive: true });

  try {
    await downloadFile(job.url, job.targetPath, options.headers);
    return { ...job, status: "downloaded" };
  } catch (error) {
    return { ...job, status: "manual_review", reason: error.message };
  }
}

function downloadFile(url, targetPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const request = client.get(url, { headers }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        downloadFile(new URL(response.headers.location, url).toString(), targetPath, headers)
          .then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`download failed with HTTP ${response.statusCode}`));
        return;
      }

      const stream = fs.createWriteStream(targetPath);
      response.pipe(stream);
      stream.on("finish", () => stream.close(resolve));
      stream.on("error", reject);
    });
    request.on("error", reject);
  });
}

async function main(argv) {
  const manifestArg = argv[2];
  if (!manifestArg) {
    throw new Error("Usage: node download-attachments.cjs <prepared-manifest.json> [--dry-run]");
  }

  const dryRun = argv.includes("--dry-run");
  const plan = JSON.parse(fs.readFileSync(manifestArg, "utf8"));
  const jobs = buildDownloadJobs(plan);
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome Safari",
    Referer: "https://mooc2-ans.chaoxing.com/",
  };

  if (dryRun) {
    process.stdout.write(`${JSON.stringify({ tmpDir: plan.tmpDir, jobs }, null, 2)}\n`);
    return;
  }

  const results = [];
  for (const job of jobs) {
    results.push(await downloadJob(job, { headers }));
  }
  process.stdout.write(`${JSON.stringify({ tmpDir: plan.tmpDir, jobs: results }, null, 2)}\n`);
}

if (require.main === module) {
  main(process.argv).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  selectDownloadUrl,
  targetFilename,
  buildDownloadJobs,
  downloadJob,
};
