const { createLocalConfig } = require("./tool-config.cjs");

function main() {
  const { configPath, config, workspaceDirs } = createLocalConfig();
  process.stdout.write(`Wrote ${configPath}\n`);
  for (const [key, value] of Object.entries(config)) {
    process.stdout.write(`${value ? "OK" : "MISSING"} ${key}: ${value || "not found"}\n`);
  }
  if (workspaceDirs.length) {
    process.stdout.write(`Created workspace directories: ${workspaceDirs.join(", ")}\n`);
  } else {
    process.stdout.write("Workspace directories already exist.\n");
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
};
