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

test("after a checkup the fix is offered, applied on a yes, and the score goes up", async (t) => {
  const { offerFix } = await import("../src/actions.mjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-offer-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "package-lock.json"), "x".repeat(40 * 1024));
  const installed = [{ id: "claude-code", onPath: true, via: ["command: claude"] }];
  const questions = [];
  const no = await offerFix({ cwd: dir, home: dir, installed, ask: async (q) => (questions.push(q), false) });
  assert.match(questions[0], /^Fix it now\? Your AI tools will skip package-lock\.json; your code is not touched\. \(y\/N\) $/);
  assert.match(no, /Nothing changed\. Fix it later with: npx which-ai-to-use fix/);
  assert.ok(!fs.existsSync(path.join(dir, ".claude", "settings.json")));
  const yes = await offerFix({ cwd: dir, home: dir, installed, ask: async () => true });
  assert.match(yes, /Updated \.claude\/settings\.json/);
  assert.match(yes, /AI setup score: \d+ → \d+\/100/);
  const [before, after] = /(\d+) → (\d+)/.exec(yes).slice(1).map(Number);
  assert.ok(after > before);
  assert.equal(await offerFix({ cwd: dir, home: dir, installed, ask: async () => true }), "", "nothing left to fix");
});
