import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { onPath } from "./detect.mjs";

export const EXTENSION_ID = "wst2002.which-ai-to-use";
// Built into the npm package at publish time (scripts/bundle-vsix.mjs), so setup works before or without the Marketplace.
export const BUNDLED_VSIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "vscode", "which-ai-to-use.vsix");
const EDITORS = [
  { bin: "code", name: "VS Code" },
  { bin: "code-insiders", name: "VS Code Insiders" },
  { bin: "cursor", name: "Cursor" },
  { bin: "windsurf", name: "Windsurf" },
];
// npx puts the package's own bin folder on PATH while it runs; that is not a real install.
const TEMPORARY_BIN = /[\\/](_npx|\.npm[\\/]_npx)[\\/]|[\\/]node_modules[\\/]\.bin$/;

// .cmd shims on Windows need a shell. Every argument here comes from this file or the package path, never from the user.
function run(bin, args, env) {
  const quoted = process.platform === "win32" ? args.map((a) => (/\s/.test(a) ? `"${a}"` : a)) : args;
  const result = spawnSync(bin, quoted, { shell: process.platform === "win32", env, encoding: "utf8", timeout: 180000 });
  return result.status === 0;
}

const dirsOf = (env) => (env.PATH ?? env.Path ?? "").split(path.delimiter).filter(Boolean);

/** Editors whose command-line tool is on PATH (VS Code, Insiders, Cursor, Windsurf). */
export function findEditors(env = process.env, platform = process.platform) {
  const dirs = dirsOf(env);
  return EDITORS.filter((editor) => onPath(editor.bin, dirs, platform));
}

/** Whether `which-ai-to-use` is installed for good, not only on PATH for this npx run. */
export function hasGlobalCommand(env = process.env, platform = process.platform) {
  return onPath("which-ai-to-use", dirsOf(env).filter((dir) => !TEMPORARY_BIN.test(dir)), platform);
}

export const installGlobal = (version, env = process.env) => run("npm", ["install", "-g", `which-ai-to-use@${version}`], env);

/**
 * Installs the extension from the editor's own extension store; if that fails (offline, not listed there yet,
 * or an editor with another store), from the copy inside this package. Returns "store", "bundled" or null.
 */
export function installExtension(editor, { env = process.env, vsix = BUNDLED_VSIX } = {}) {
  if (run(editor.bin, ["--install-extension", EXTENSION_ID, "--force"], env)) return "store";
  if (fs.existsSync(vsix) && run(editor.bin, ["--install-extension", vsix, "--force"], env)) return "bundled";
  return null;
}
