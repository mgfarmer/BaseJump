// Generates the marketplace icon from the high-res source image.
// Usage: node scripts/generate-icons.js
const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const src = path.resolve(__dirname, "../resources/BaseJumpSource.png");
const outDir = path.resolve(__dirname, "../img");
const out = path.join(outDir, "basejump-icon.png");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

sharp(src)
  .resize(128, 128, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .toFile(out)
  .then(() => console.log(`  ✔  ${out}  (128×128)`))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
