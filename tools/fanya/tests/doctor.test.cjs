const assert = require("node:assert/strict");
const test = require("node:test");

const { runDoctor } = require("../scripts/doctor.cjs");

test("doctor reports core tools and impact guidance", () => {
  const lines = runDoctor({
    tools: {
      ffmpegPath: "",
      ffprobePath: "",
      sevenZipPath: "",
      tarPath: "",
      pdftoppmPath: "",
      pdftotextPath: "",
    },
    pythonCommand: "",
    chromeCommand: "",
    browserActCommand: "",
    hasPillow: false,
  });

  assert.ok(lines.some((line) => line.startsWith("OK REQUIRED node:")));
  assert.ok(lines.some((line) => line.startsWith("MISSING REQUIRED Chrome:")));
  assert.ok(lines.some((line) => line.startsWith("MISSING REQUIRED browser-act:")));
  assert.ok(lines.some((line) => line.startsWith("MISSING RECOMMENDED ffmpeg:")));
  assert.ok(lines.some((line) => line.startsWith("MISSING RECOMMENDED ffprobe:")));
  assert.ok(lines.some((line) => line.startsWith("MISSING RECOMMENDED pdftotext:")));
  assert.ok(lines.some((line) => line.startsWith("MISSING RECOMMENDED python:")));
  assert.ok(lines.some((line) => line.includes("missing REQUIRED tools blocks normal workflow startup")));
});
