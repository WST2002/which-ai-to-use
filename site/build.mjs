// Builds the static website into _site/: the page, the advice engine and the app list.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  ["site/index.html", "index.html"],
  ["src/everyday.mjs", "everyday.mjs"],
  ["data/apps.json", "apps.json"],
];

export function buildSite(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const [from, to] of FILES) fs.copyFileSync(path.join(root, from), path.join(outDir, to));
  fs.writeFileSync(path.join(outDir, ".nojekyll"), "");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = path.resolve(process.argv[2] ?? "_site");
  buildSite(outDir);
  console.log(`Site built in ${outDir}`);
}
