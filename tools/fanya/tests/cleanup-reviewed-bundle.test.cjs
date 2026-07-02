const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { cleanupReviewedBundle } = require("../scripts/cleanup-reviewed-bundle.cjs");

test("cleanupReviewedBundle requires confirm", () => {
  assert.throws(() => cleanupReviewedBundle("missing.json"), /--confirm/);
});

test("cleanupReviewedBundle deletes only source zip and extracted dir", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-clean-bundle-"));
  const bundleDir = path.join(root, "tmp", "bundle");
  const extractedDir = path.join(root, "tmp", "work-4", "bundle-work");
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.mkdirSync(extractedDir, { recursive: true });
  const sourceZip = path.join(bundleDir, "assignment-a.zip");
  const otherZip = path.join(bundleDir, "其他作业.zip");
  fs.writeFileSync(sourceZip, "zip");
  fs.writeFileSync(otherZip, "zip");

  const sessionPath = path.join(root, "tmp", "session", "fanya-current-task.json");
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, JSON.stringify({
    sourceZip: path.relative(root, sourceZip),
    reviewSourcePath: path.relative(root, extractedDir),
  }));

  const result = cleanupReviewedBundle(sessionPath, {
    confirm: true,
    cwd: root,
  });

  assert.equal(result.deleted.length, 2);
  assert.equal(fs.existsSync(sourceZip), false);
  assert.equal(fs.existsSync(extractedDir), false);
  assert.equal(fs.existsSync(otherZip), true);
  assert.equal(fs.existsSync(bundleDir), true);
});

test("cleanupReviewedBundle defaults to session path when no explicit path is given", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-clean-bundle-default-"));
  const bundleDir = path.join(root, "tmp", "bundle");
  const workDir = path.join(root, "tmp", "work-1", "bundle-work");
  const sessionPath = path.join(root, "tmp", "session", "fanya-current-task.json");
  fs.mkdirSync(bundleDir, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  const sourceZip = path.join(bundleDir, "work.zip");
  fs.writeFileSync(sourceZip, "zip");
  fs.writeFileSync(sessionPath, JSON.stringify({
    sourceZip: path.relative(root, sourceZip),
    reviewSourcePath: path.relative(root, workDir),
  }));

  const result = cleanupReviewedBundle(undefined, { confirm: true, cwd: root });

  assert.equal(result.deleted.length, 2);
  assert.equal(fs.existsSync(sourceZip), false);
  assert.equal(fs.existsSync(workDir), false);
});
