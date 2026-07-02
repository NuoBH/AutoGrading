const fs = require("node:fs");
const path = require("node:path");

const { resolveTools, LOCAL_CONFIG_PATH, EXAMPLE_CONFIG_PATH, WORKSPACE_DIRS } = require("./tool-config.cjs");

function checkDir(relativePath) {
  return fs.existsSync(relativePath) && fs.statSync(relativePath).isDirectory();
}

function statusLine(label, value, help) {
  if (value) return `OK ${label}: ${value}`;
  return `MISSING ${label}: ${help}`;
}

function runDoctor() {
  const tools = resolveTools();
  const lines = [
    statusLine("ffmpeg", tools.ffmpegPath, "install ffmpeg or set ffmpegPath in tools/fanya/config.local.json"),
    statusLine("7z", tools.sevenZipPath, "install 7-Zip or set sevenZipPath in tools/fanya/config.local.json"),
    statusLine("tar", tools.tarPath, "Windows tar should be available; otherwise install tar or use 7-Zip"),
    statusLine("pdftoppm", tools.pdftoppmPath, "install Poppler or set pdftoppmPath in tools/fanya/config.local.json"),
    `${fs.existsSync(LOCAL_CONFIG_PATH) ? "OK" : "INFO"} config.local.json: ${LOCAL_CONFIG_PATH}`,
    `INFO config example: ${EXAMPLE_CONFIG_PATH}`,
    ...WORKSPACE_DIRS.map((dir) => `${checkDir(dir) ? "OK" : "MISSING"} ${dir} directory: ${path.resolve(dir)}`),
  ];
  return lines;
}

if (require.main === module) {
  process.stdout.write(`${runDoctor().join("\n")}\n`);
}

module.exports = {
  runDoctor,
};
