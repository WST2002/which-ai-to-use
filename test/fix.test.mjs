import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyIgnoreAdvice } from "../src/fix.mjs";
import { ignoreAdvice } from "../src/tokens.mjs";

function project(t, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-fix-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

const read = (dir, file) => fs.readFileSync(path.join(dir, file), "utf8");

test("adds deny rules to Claude Code settings without losing what is already there", (t) => {
  const existing = { model: "sonnet", permissions: { allow: ["Bash(npm test)"], deny: ["Read(./.env)"] } };
  const dir = project(t, { ".claude/settings.json": JSON.stringify(existing) });
  const changes = applyIgnoreAdvice(dir, ignoreAdvice(["package-lock.json"], ["claude-code"]));
  const settings = JSON.parse(read(dir, ".claude/settings.json"));
  assert.equal(settings.model, "sonnet");
  assert.deepEqual(settings.permissions.allow, ["Bash(npm test)"]);
  assert.deepEqual(settings.permissions.deny, ["Read(./.env)", "Read(./package-lock.json)"]);
  assert.deepEqual(changes, [{ file: ".claude/settings.json", added: 1 }]);
});

test("creates ignore files and never adds the same line twice", (t) => {
  const dir = project(t, { ".geminiignore": "dist/\npackage-lock.json\n" });
  const advice = ignoreAdvice(["package-lock.json", "data/export.csv"], ["cursor", "gemini-cli", "claude-code"]);
  applyIgnoreAdvice(dir, advice);
  const again = applyIgnoreAdvice(dir, advice);
  assert.equal(read(dir, ".cursorignore"), "package-lock.json\ndata/export.csv\n");
  assert.equal(read(dir, ".geminiignore"), "dist/\npackage-lock.json\ndata/export.csv\n");
  assert.deepEqual(JSON.parse(read(dir, ".claude/settings.json")).permissions.deny, ["Read(./package-lock.json)", "Read(./data/export.csv)"]);
  assert.deepEqual(again, []);
});

test("a settings file that is not valid JSON is left alone and reported", (t) => {
  const dir = project(t, { ".claude/settings.json": "{ broken" });
  assert.throws(() => applyIgnoreAdvice(dir, ignoreAdvice(["package-lock.json"], ["claude-code"])), /\.claude\/settings\.json is not valid JSON/);
  assert.equal(read(dir, ".claude/settings.json"), "{ broken");
});
