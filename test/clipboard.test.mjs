import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { copyFileToClipboard } from "../src/clipboard.mjs";

// Reads the real clipboard back, as UTF-8, with the same system tools.
function readClipboard(dir) {
  if (process.platform === "darwin") return spawnSync("pbpaste", { encoding: "utf8" }).stdout;
  if (process.platform === "win32") {
    const out = path.join(dir, "back.txt");
    spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw | Set-Content -Encoding UTF8 -NoNewline -LiteralPath $env:OUT"], { env: { ...process.env, OUT: out } });
    return fs.readFileSync(out, "utf8").replace(/^﻿/, "");
  }
  for (const [command, args] of [["wl-paste", []], ["xclip", ["-selection", "clipboard", "-o"]], ["xsel", ["--clipboard", "--output"]]]) {
    const result = spawnSync(command, args, { encoding: "utf8" });
    if (result.status === 0) return result.stdout;
  }
  return null;
}

test("copies a note with non-ASCII text to the clipboard exactly", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-clip-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "HANDOFF.md");
  const text = "# Handoff\n\n- modified `src/cart.js` (+1 −0) ✓ कार्ट\n";
  fs.writeFileSync(file, text);
  const tool = copyFileToClipboard(file);
  if (!tool) return t.skip("no clipboard tool on this machine");
  assert.equal(readClipboard(dir).replace(/\r\n/g, "\n").trimEnd(), text.trimEnd());
});

test("a platform without a known clipboard tool reports that nothing was copied", (t) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "waitu-clip-")), "note.md");
  t.after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));
  fs.writeFileSync(file, "x");
  assert.equal(copyFileToClipboard(file, "plan9"), null);
});
