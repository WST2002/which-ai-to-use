import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EXTENSION_ID, findEditors, hasGlobalCommand, installExtension } from "../src/setup.mjs";

const windows = process.platform === "win32";
const cli = path.resolve(import.meta.dirname, "../bin/cli.mjs");

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-setup-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// A stand-in editor command that logs its arguments. `storeHasIt: false` makes installing by id fail, like an
// extension that is not in that editor's store.
function standIn(dir, bin, { storeHasIt }) {
  const refuse = storeHasIt ? "" : windows ? `if "%~2"=="${EXTENSION_ID}" exit /b 1\r\n` : `[ "$2" = "${EXTENSION_ID}" ] && exit 1\n`;
  if (windows) fs.writeFileSync(path.join(dir, `${bin}.cmd`), `@echo off\r\necho %*>>"%WAITU_LOG%"\r\n${refuse}exit /b 0\r\n`);
  else {
    fs.writeFileSync(path.join(dir, bin), `#!/bin/sh\necho "$@" >> "$WAITU_LOG"\n${refuse}exit 0\n`);
    fs.chmodSync(path.join(dir, bin), 0o755);
  }
}

// Windows quotes every argument; the log is read without the quotes.
const readLog = (file) => fs.readFileSync(file, "utf8").replace(/"/g, "");

const envFor = (bin, log) => ({ ...process.env, PATH: [bin, process.env.PATH].join(path.delimiter), WAITU_LOG: log });

test("finds the editors whose command is on PATH", (t) => {
  const bin = tempDir(t);
  standIn(bin, "code", { storeHasIt: true });
  standIn(bin, "cursor", { storeHasIt: true });
  assert.deepEqual(findEditors({ PATH: bin }).map((e) => e.name), ["VS Code", "Cursor"]);
  assert.deepEqual(findEditors({ PATH: tempDir(t) }), []);
});

test("installs from the editor's store when it has the extension", (t) => {
  const bin = tempDir(t);
  const log = path.join(bin, "log.txt");
  standIn(bin, "code", { storeHasIt: true });
  assert.equal(installExtension({ bin: "code", name: "VS Code" }, { env: envFor(bin, log), vsix: path.join(bin, "none.vsix") }), "store");
  assert.match(readLog(log), new RegExp(`--install-extension ${EXTENSION_ID} --force`));
});

test("falls back to the copy inside the package when the store does not have it", (t) => {
  const bin = tempDir(t);
  const log = path.join(bin, "log.txt");
  const vsix = path.join(bin, "which ai.vsix");
  fs.writeFileSync(vsix, "x");
  standIn(bin, "cursor", { storeHasIt: false });
  assert.equal(installExtension({ bin: "cursor", name: "Cursor" }, { env: envFor(bin, log), vsix }), "bundled");
  const calls = readLog(log).trim().split(/\r?\n/);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /--install-extension "?.*which ai\.vsix"? --force/);
});

test("a package path with & in it stays one argument", (t) => {
  const bin = tempDir(t);
  const log = path.join(bin, "log.txt");
  const folder = path.join(bin, "R&D");
  fs.mkdirSync(folder);
  const vsix = path.join(folder, "which-ai.vsix");
  fs.writeFileSync(vsix, "x");
  standIn(bin, "code", { storeHasIt: false });
  assert.equal(installExtension({ bin: "code", name: "VS Code" }, { env: envFor(bin, log), vsix }), "bundled");
  assert.ok(readLog(log).includes("R&D"));
});

test("reports failure when neither the store nor a bundled copy works", (t) => {
  const bin = tempDir(t);
  standIn(bin, "code", { storeHasIt: false });
  assert.equal(installExtension({ bin: "code", name: "VS Code" }, { env: envFor(bin, path.join(bin, "log.txt")), vsix: path.join(bin, "missing.vsix") }), null);
});

test("a command that npx only put on PATH for this run is not a global install", (t) => {
  const real = tempDir(t);
  const npx = path.join(tempDir(t), "_npx", "abc", "node_modules", ".bin");
  fs.mkdirSync(npx, { recursive: true });
  for (const dir of [real, npx]) standIn(dir, "which-ai-to-use", { storeHasIt: true });
  assert.equal(hasGlobalCommand({ PATH: npx }), false);
  assert.equal(hasGlobalCommand({ PATH: [npx, real].join(path.delimiter) }), true);
});


function setupRun(t, args) {
  const bin = tempDir(t);
  const log = path.join(bin, "log.txt");
  standIn(bin, "code", { storeHasIt: true });
  standIn(bin, "npm", { storeHasIt: true });
  const env = { ...process.env, PATH: [bin, path.dirname(process.execPath)].join(path.delimiter), WAITU_LOG: log };
  const result = spawnSync(process.execPath, [cli, "setup", ...args], { env, encoding: "utf8", input: "" });
  return { result, calls: fs.existsSync(log) ? readLog(log) : "" };
}

test("setup --yes installs the terminal command and the VS Code sidebar", (t) => {
  const { result, calls } = setupRun(t, ["--yes"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(calls, /install -g which-ai-to-use@\d+\.\d+\.\d+/);
  assert.match(calls, new RegExp(`--install-extension ${EXTENSION_ID} --force`));
  assert.match(result.stdout, /✓ Terminal: installed/);
  assert.match(result.stdout, /✓ VS Code: installed from its extension store\. Click the ✦ Which AI icon on the left\./);
});

test("setup without a yes installs nothing and says how to go ahead", (t) => {
  const { result, calls } = setupRun(t, []);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(calls, "");
  assert.match(result.stdout, /Nothing was installed without a yes\. Run with --yes/);
});
