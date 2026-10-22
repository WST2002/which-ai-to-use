// Builds the VS Code extension into vscode/which-ai-to-use.vsix before npm packs the package,
// so `which-ai-to-use setup` can install the sidebar even where the extension store does not have it.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extension = path.join(root, "extension");
const out = path.join(root, "vscode", "which-ai-to-use.vsix");

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed in ${path.relative(root, cwd) || "."}`);
}

if (!fs.existsSync(path.join(extension, "node_modules", "@vscode", "vsce"))) run("npm", ["ci"], extension);
fs.mkdirSync(path.dirname(out), { recursive: true });
run("node", ["scripts/sync.mjs"], extension);
run("npx", ["--no-install", "vsce", "package", "--out", out], extension);
