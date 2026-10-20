import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { estimateTokens, listProjectFiles, rulesCost } from "../src/tokens.mjs";

function project(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-tokens-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

test("tokens are estimated at about four characters each", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("abcd"), 1);
  assert.equal(estimateTokens("a".repeat(4001)), 1001);
});

test("project files skip dependency folders when the project is not a git repo", (t) => {
  const dir = project(t, { "src/app.js": "x", "node_modules/lib/index.js": "x", "dist/app.js": "x" });
  assert.deepEqual(listProjectFiles(dir), ["src/app.js"]);
});

test("project files follow .gitignore in a git repo", (t) => {
  const dir = project(t, { "src/app.js": "x", "secret.log": "x", ".gitignore": "*.log\n" });
  spawnSync("git", ["init", "-q"], { cwd: dir });
  assert.deepEqual(listProjectFiles(dir).sort(), [".gitignore", "src/app.js"]);
});

test("rules files report their size and their largest sections", (t) => {
  const long = (n) => "word ".repeat(n);
  const dir = project(t, {
    "CLAUDE.md": `# Project\n${long(50)}\n## Setup\n${long(2000)}\n## Style\n${long(400)}\n`,
    "AGENTS.md": "# Short\nUse npm test.\n",
  });
  const report = rulesCost(dir);
  const claude = report.find((r) => r.file === "CLAUDE.md");
  assert.ok(claude.tokens > 2000);
  assert.equal(claude.large, true);
  assert.deepEqual(claude.sections.map((s) => s.title), ["Setup", "Style", "Project"]);
  assert.equal(report.find((r) => r.file === "AGENTS.md").large, false);
  assert.equal(report.length, 2);
});
