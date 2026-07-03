const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { commandExists, resolveTools, LOCAL_CONFIG_PATH, EXAMPLE_CONFIG_PATH, WORKSPACE_DIRS } = require("./tool-config.cjs");

function checkDir(relativePath) {
  return fs.existsSync(relativePath) && fs.statSync(relativePath).isDirectory();
}

function statusLine(label, value, help) {
  if (value) return `OK ${label}: ${value}`;
  return `MISSING ${label}: ${help}`;
}

function requiredStatusLine(label, value, help) {
  if (value) return `OK REQUIRED ${label}: ${value}`;
  return `MISSING REQUIRED ${label}: ${help}`;
}

function recommendedStatusLine(label, value, help) {
  if (value) return `OK RECOMMENDED ${label}: ${value}`;
  return `MISSING RECOMMENDED ${label}: ${help}`;
}

function resolvePython() {
  if (commandExists("python")) return "python";
  if (commandExists("py")) return "py";
  if (commandExists("python3")) return "python3";
  return "";
}

function resolveChrome() {
  const candidates = [
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe") : "",
    process.env["ProgramFiles(x86)"] ? path.join(process.env["ProgramFiles(x86)"], "Google", "Chrome", "Application", "chrome.exe") : "",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : "",
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  if (commandExists("chrome")) return "chrome";
  if (commandExists("chrome.exe")) return "chrome.exe";
  return "";
}

function hasPythonPackage(pythonCommand, packageName) {
  if (!pythonCommand) return false;
  try {
    execFileSync(pythonCommand, ["-c", `import ${packageName}`], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function runDoctor(options = {}) {
  const tools = options.tools ?? resolveTools(options);
  const pythonCommand = options.pythonCommand ?? resolvePython();
  const chrome = options.chromeCommand ?? resolveChrome();
  const browserAct = options.browserActCommand ?? (commandExists("browser-act") ? "browser-act" : "");
  const hasPillow = options.hasPillow ?? hasPythonPackage(pythonCommand, "PIL");
  const lines = [
    requiredStatusLine("node", process.version, "install Node.js"),
    requiredStatusLine("Chrome", chrome, "install Google Chrome for browser-based review"),
    requiredStatusLine("browser-act", browserAct, "install/configure browser-act; the workflow uses it for browser navigation and web roster capture"),
    recommendedStatusLine("ffmpeg", tools.ffmpegPath, "install ffmpeg or set ffmpegPath in tools/fanya/config.local.json"),
    recommendedStatusLine("ffprobe", tools.ffprobePath, "install ffmpeg/ffprobe for duration-aware video frame sampling"),
    recommendedStatusLine("7z", tools.sevenZipPath, "install 7-Zip or set sevenZipPath in tools/fanya/config.local.json"),
    statusLine("tar", tools.tarPath, "Windows tar should be available; otherwise install tar or use 7-Zip"),
    recommendedStatusLine("pdftoppm", tools.pdftoppmPath, "install Poppler or set pdftoppmPath in tools/fanya/config.local.json"),
    recommendedStatusLine("python", pythonCommand, "install Python 3 for PNG contact sheets and helper scripts"),
    recommendedStatusLine("python Pillow", hasPillow ? "available" : "", "install with: python -m pip install Pillow"),
    `${fs.existsSync(LOCAL_CONFIG_PATH) ? "OK" : "INFO"} config.local.json: ${LOCAL_CONFIG_PATH}`,
    `INFO config example: ${EXAMPLE_CONFIG_PATH}`,
    ...WORKSPACE_DIRS.map((dir) => `${checkDir(dir) ? "OK" : "MISSING"} ${dir} directory: ${path.resolve(dir)}`),
    "INFO impact: missing REQUIRED tools blocks normal workflow startup; missing ffmpeg/ffprobe limits video evidence; missing pdftoppm limits PDF rendering; missing Pillow limits PNG contact-sheet previews.",
  ];
  return lines;
}

if (require.main === module) {
  process.stdout.write(`${runDoctor().join("\n")}\n`);
}

module.exports = {
  hasPythonPackage,
  runDoctor,
  resolveChrome,
  resolvePython,
};
