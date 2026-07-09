const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const TOOL_DIR = path.resolve(__dirname, "..");
const LOCAL_CONFIG_PATH = path.join(TOOL_DIR, "config.local.json");
const EXAMPLE_CONFIG_PATH = path.join(TOOL_DIR, "config.example.json");

const COMMON_PATHS = {
  sevenZipPath: [
    "C:\\Program Files\\7-Zip\\7z.exe",
    "C:\\Program Files (x86)\\7-Zip\\7z.exe",
  ],
  ffmpegPath: [],
  ffprobePath: [],
  pdftoppmPath: [
    path.join(
      process.env.USERPROFILE || "",
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "native",
      "poppler",
      "Library",
      "bin",
      "pdftoppm.exe",
    ),
  ],
  pdftotextPath: [
    path.join(
      process.env.USERPROFILE || "",
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "native",
      "poppler",
      "Library",
      "bin",
      "pdftotext.exe",
    ),
  ],
};

const WORKSPACE_DIRS = [
  "tmp",
  path.join("tmp", "bundle"),
  path.join("tmp", "session"),
  "rubrics",
  "result",
  "outputs",
];

function loadConfig(configPath = LOCAL_CONFIG_PATH) {
  if (!fs.existsSync(configPath)) return {};
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function commandExists(command) {
  try {
    execFileSync(process.platform === "win32" ? "where.exe" : "which", [command], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function resolveCommand(command, configKey, options = {}) {
  const config = options.config ?? loadConfig(options.configPath);
  const configured = config[configKey];
  if (configured && fs.existsSync(configured)) return configured;

  for (const candidate of options.candidates ?? COMMON_PATHS[configKey] ?? []) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return commandExists(command) ? command : "";
}

function resolveTools(options = {}) {
  const config = options.config ?? loadConfig(options.configPath);
  return {
    ffmpegPath: resolveCommand("ffmpeg", "ffmpegPath", { ...options, config }),
    ffprobePath: resolveCommand("ffprobe", "ffprobePath", { ...options, config }),
    sevenZipPath: resolveCommand("7z", "sevenZipPath", { ...options, config }),
    tarPath: resolveCommand("tar", "tarPath", { ...options, config }),
    pdftoppmPath: resolveCommand("pdftoppm", "pdftoppmPath", { ...options, config }),
    pdftotextPath: resolveCommand("pdftotext", "pdftotextPath", { ...options, config }),
    configPath: options.configPath || LOCAL_CONFIG_PATH,
    exampleConfigPath: EXAMPLE_CONFIG_PATH,
  };
}

function createLocalConfig(options = {}) {
  const tools = resolveTools(options);
  const configPath = options.configPath || LOCAL_CONFIG_PATH;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const config = {
    ffmpegPath: tools.ffmpegPath,
    ffprobePath: tools.ffprobePath,
    sevenZipPath: tools.sevenZipPath,
    tarPath: tools.tarPath,
    pdftoppmPath: tools.pdftoppmPath,
    pdftotextPath: tools.pdftotextPath,
  };
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  const workspaceRoot = options.workspaceRoot || process.cwd();
  const workspaceDirs = ensureWorkspaceDirs(workspaceRoot);
  return { configPath, config, workspaceDirs };
}

function ensureWorkspaceDirs(workspaceRoot = process.cwd()) {
  const created = [];
  for (const relativePath of WORKSPACE_DIRS) {
    const absolutePath = path.resolve(workspaceRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      fs.mkdirSync(absolutePath, { recursive: true });
      created.push(relativePath);
    }
  }
  return created;
}

module.exports = {
  LOCAL_CONFIG_PATH,
  EXAMPLE_CONFIG_PATH,
  WORKSPACE_DIRS,
  loadConfig,
  commandExists,
  resolveCommand,
  resolveTools,
  createLocalConfig,
  ensureWorkspaceDirs,
};
