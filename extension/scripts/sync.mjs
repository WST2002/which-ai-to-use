// Copies the CLI's engine (src/ and data/) into lib/, so the extension runs exactly the same code.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const lib = path.resolve(here, "..", "lib");

fs.rmSync(lib, { recursive: true, force: true });
for (const folder of ["src", "data"]) fs.cpSync(path.join(repo, folder), path.join(lib, folder), { recursive: true });
console.log(`Copied src/ and data/ into ${path.relative(process.cwd(), lib) || "lib"}`);
