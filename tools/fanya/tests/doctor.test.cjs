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
    },
    pythonCommand: "",
    browserActCommand: "",
    hasPillow: false,
  });

  assert.ok(lines.some((line) => line.startsWith("OK node:")));
  assert.ok(lines.some((line) => line.startsWith("MISSING ffmpeg:")));
  assert.ok(lines.some((line) => line.startsWith("MISSING ffprobe:")));
  assert.ok(lines.some((line) => line.startsWith("MISSING python:")));
  assert.ok(lines.some((line) => line.startsWith("MISSING browser-act:")));
  assert.ok(lines.some((line) => line.includes("missing ffmpeg/ffprobe limits video evidence")));
});
