const { execFileSync } = require("node:child_process");

const { runDoctor, resolvePython } = require("./doctor.cjs");
const { ensureWorkspaceDirs } = require("./tool-config.cjs");

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  const noMode = !["--check", "--prepare", "--print-install-guide", "--install-python-packages"].some((flag) => args.has(flag));
  return {
    check: noMode || args.has("--check"),
    prepare: noMode || args.has("--prepare"),
    printInstallGuide: noMode || args.has("--print-install-guide"),
    installPythonPackages: args.has("--install-python-packages"),
  };
}

function installPythonPackages(pythonCommand = resolvePython()) {
  if (!pythonCommand) {
    return ["MISSING python: cannot install Pillow automatically. Install Python 3 first."];
  }
  execFileSync(pythonCommand, ["-m", "pip", "install", "Pillow"], { stdio: "inherit" });
  return ["OK installed/updated Python package: Pillow"];
}

function installGuide() {
  return [
    "Install guide:",
    "- Node.js: https://nodejs.org/",
    "- Chrome: https://www.google.com/chrome/",
    "- browser-act: install/configure it for authenticated web_download review.",
    "- ffmpeg + ffprobe: install FFmpeg and ensure ffmpeg/ffprobe are on PATH.",
    "- 7-Zip: install 7-Zip and ensure 7z is on PATH, or keep the default Program Files install path.",
    "- Poppler pdftoppm: install Poppler, or set pdftoppmPath in tools/fanya/config.local.json.",
    "- Python Pillow: run `python -m pip install Pillow` or use this script with `--install-python-packages`.",
    "Windows winget examples, run manually only if you trust the source:",
    "- winget install OpenJS.NodeJS.LTS",
    "- winget install Google.Chrome",
    "- winget install Gyan.FFmpeg",
    "- winget install 7zip.7zip",
  ];
}

function runSetup(options = {}) {
  const output = [];
  if (options.prepare) {
    const created = ensureWorkspaceDirs(options.workspaceRoot || process.cwd());
    output.push(created.length ? `Created directories: ${created.join(", ")}` : "Workspace directories already exist.");
  }
  if (options.installPythonPackages) {
    output.push(...installPythonPackages(options.pythonCommand));
  }
  if (options.check) {
    output.push(...runDoctor(options.doctorOptions || {}));
  }
  if (options.printInstallGuide) {
    output.push(...installGuide());
  }
  return output;
}

function main(argv = process.argv) {
  const options = parseArgs(argv);
  const lines = runSetup(options);
  process.stdout.write(`${lines.join("\n")}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  installGuide,
  parseArgs,
  runSetup,
};
