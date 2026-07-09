const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createLocalConfig,
  ensureWorkspaceDirs,
  loadConfig,
  resolveCommand,
  resolveTools,
  WORKSPACE_DIRS,
} = require("../scripts/tool-config.cjs");

test("loadConfig returns empty object when local config is absent", () => {
  assert.deepEqual(loadConfig(path.join(os.tmpdir(), "missing-fanya-config.json")), {});
});

test("resolveCommand prefers configured executable path", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-config-"));
  const fakeTool = path.join(root, "tool.exe");
  fs.writeFileSync(fakeTool, "");

  assert.equal(
    resolveCommand("missing-tool", "ffmpegPath", { config: { ffmpegPath: fakeTool } }),
    fakeTool,
  );
});

test("createLocalConfig writes detected tool paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-local-config-"));
  const configPath = path.join(root, "config.local.json");

  const result = createLocalConfig({
    configPath,
    workspaceRoot: root,
    config: {
      ffmpegPath: "",
      ffprobePath: "",
      sevenZipPath: "",
      tarPath: "",
      pdftoppmPath: "",
      pdftotextPath: "",
    },
  });

  assert.equal(result.configPath, configPath);
  assert.equal(fs.existsSync(configPath), true);
  const written = JSON.parse(fs.readFileSync(configPath, "utf8"));
  assert.equal(Object.hasOwn(written, "ffmpegPath"), true);
  assert.equal(Object.hasOwn(written, "ffprobePath"), true);
  assert.equal(Object.hasOwn(written, "sevenZipPath"), true);
  assert.equal(Object.hasOwn(written, "pdftotextPath"), true);
  for (const relativePath of WORKSPACE_DIRS) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true);
  }
});

test("resolveTools exposes optional ffprobePath and pdftotextPath", () => {
  const tools = resolveTools({ config: { ffmpegPath: "", ffprobePath: "", sevenZipPath: "", tarPath: "", pdftoppmPath: "", pdftotextPath: "" } });

  assert.equal(Object.hasOwn(tools, "ffprobePath"), true);
  assert.equal(Object.hasOwn(tools, "pdftotextPath"), true);
});

test("ensureWorkspaceDirs creates first-run grading folders", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fanya-workspace-dirs-"));
  const created = ensureWorkspaceDirs(root);

  assert.deepEqual(created, WORKSPACE_DIRS);
  for (const relativePath of WORKSPACE_DIRS) {
    assert.equal(fs.statSync(path.join(root, relativePath)).isDirectory(), true);
  }

  assert.deepEqual(ensureWorkspaceDirs(root), []);
});
