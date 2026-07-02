const { createResultFile } = require("./result-utils.cjs");

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--course") {
      args.courseName = value;
      index += 1;
    } else if (key === "--assignment") {
      args.assignmentName = value;
      index += 1;
    } else if (key === "--rubric-path") {
      args.rubricPath = value;
      index += 1;
    } else if (key === "--result-path") {
      args.resultPath = value;
      index += 1;
    } else if (key === "--output-dir") {
      args.outputDir = value;
      index += 1;
    } else if (key === "--date") {
      args.date = value;
      index += 1;
    }
  }
  return args;
}

function main(argv) {
  const resultPath = createResultFile(parseArgs(argv));
  process.stdout.write(`${resultPath}\n`);
}

if (require.main === module) {
  try {
    main(process.argv);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  main,
  parseArgs,
};
