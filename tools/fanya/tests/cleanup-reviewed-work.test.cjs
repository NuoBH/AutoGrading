const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { cleanupReviewedWork } = require("../scripts/cleanup-reviewed-work.cjs");

test("cleanupReviewedWork requires confirm", () => {
  assert.throws(() => cleanupReviewedWork({ workIndex: 4 }), /--confirm/);
});

test("cleanupReviewedWork deletes only selected work directory", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-clean-work-"));
  const work4 = path.join(root, "tmp", "work-4");
  const work5 = path.join(root, "tmp", "work-5");
  const bundle = path.join(root, "tmp", "bundle");
  fs.mkdirSync(work4, { recursive: true });
  fs.mkdirSync(work5, { recursive: true });
  fs.mkdirSync(bundle, { recursive: true });

  const result = cleanupReviewedWork({ workIndex: 4, confirm: true, cwd: root });

  assert.equal(result.deleted.length, 1);
  assert.equal(fs.existsSync(work4), false);
  assert.equal(fs.existsSync(work5), true);
  assert.equal(fs.existsSync(bundle), true);
});

test("cleanupReviewedWork can delete reviewSourcePath from session", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-clean-work-session-"));
  const target = path.join(root, "tmp", "work-1", "web-download");
  const bundle = path.join(root, "tmp", "bundle");
  const sessionPath = path.join(root, "tmp", "session", "fanya-current-task.json");
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(bundle, { recursive: true });
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, JSON.stringify({ reviewSourcePath: path.relative(root, target) }));

  const result = cleanupReviewedWork({ confirm: true, cwd: root, sessionPath });

  assert.equal(result.deleted.length, 1);
  assert.equal(fs.existsSync(target), false);
  assert.equal(fs.existsSync(bundle), true);
});
