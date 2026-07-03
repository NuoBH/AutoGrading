const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { installGuide, parseArgs, runSetup } = require("../scripts/setup-environment.cjs");
const { WORKSPACE_DIRS } = require("../scripts/tool-config.cjs");

test("parseArgs defaults to safe prepare, check, and guide", () => {
  assert.deepEqual(parseArgs(["node", "setup-environment.cjs"]), {
    check: true,
    prepare: true,
    printInstallGuide: true,
    installPythonPackages: false,
  });
});

test("parseArgs only installs python packages when explicitly requested", () => {
  assert.equal(parseArgs(["node", "setup-environment.cjs", "--install-python-packages"]).installPythonPackages, true);
  assert.equal(parseArgs(["node", "setup-environment.cjs", "--check"]).installPythonPackages, false);
});

test("runSetup prepare creates workspace directories", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-setup-"));
  const lines = runSetup({ prepare: true, check: false, printInstallGuide: false, workspaceRoot: root });

  assert.ok(lines[0].startsWith("Created directories:"));
  for (const relativePath of WORKSPACE_DIRS) {
    assert.equal(fs.statSync(path.join(root, relativePath)).isDirectory(), true);
  }
});

test("install guide prints manual install commands without running them", () => {
  const lines = installGuide();

  assert.ok(lines.some((line) => line === "Required:"));
  assert.ok(lines.some((line) => line.includes("browser-act")));
  assert.ok(lines.some((line) => line.includes("winget install Gyan.FFmpeg")));
  assert.ok(lines.some((line) => line.includes("python -m pip install Pillow")));
});
