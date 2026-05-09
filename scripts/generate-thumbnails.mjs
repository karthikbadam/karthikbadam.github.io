import { readdir, mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse } from "node:path";
import sharp from "sharp";

const SRC_DIR = new URL("../public/images/", import.meta.url);
const OUT_DIR = new URL("../public/images/thumbs/", import.meta.url);
const WIDTHS = [720, 1440];
const QUALITY = 82;

const srcDir = fileURLToPath(SRC_DIR);
const outDir = fileURLToPath(OUT_DIR);

await mkdir(outDir, { recursive: true });

const entries = await readdir(srcDir);
const inputs = entries.filter((f) => /\.(png|jpe?g)$/i.test(f));

let built = 0;
let skipped = 0;
for (const file of inputs) {
  const { name } = parse(file);
  const inputPath = `${srcDir}${file}`;
  const inputStat = await stat(inputPath);

  for (const w of WIDTHS) {
    const outName = `${name}-${w}.webp`;
    const outPath = `${outDir}${outName}`;
    let fresh = false;
    try {
      const outStat = await stat(outPath);
      fresh = outStat.mtimeMs >= inputStat.mtimeMs;
    } catch {
      // missing; will build
    }
    if (fresh) {
      skipped += 1;
      continue;
    }
    await sharp(inputPath)
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(outPath);
    built += 1;
    console.log(`built ${outName}`);
  }
}

console.log(`done — built ${built}, skipped ${skipped} (cached)`);
