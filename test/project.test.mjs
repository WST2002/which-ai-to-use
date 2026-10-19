import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scanProject } from "../src/project.mjs";

function project(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-proj-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

test("finds each AI's rules file", (t) => {
  const dir = project(t, { "CLAUDE.md": "rules", "AGENTS.md": "rules", ".cursor/rules/project.mdc": "x", ".github/copilot-instructions.md": "x" });
  const { rulesFiles } = scanProject(dir);
  assert.deepEqual(Object.keys(rulesFiles).filter((k) => rulesFiles[k]).sort(), ["AGENTS.md", "CLAUDE.md", ".cursor/rules/project.mdc", ".github/copilot-instructions.md"].sort());
  assert.equal(rulesFiles["GEMINI.md"], false);
});

test("flags sensitive files but not examples", (t) => {
  const dir = project(t, { ".env": "KEY=1", ".env.example": "KEY=", "config/server.pem": "x", "deploy/id_rsa": "x", "src/app.js": "" });
  assert.deepEqual(scanProject(dir).sensitive.sort(), [".env", "config/server.pem", "deploy/id_rsa"]);
});

test("skips dependency and build folders", (t) => {
  const dir = project(t, { "node_modules/pkg/.env": "x", "dist/key.pem": "x" });
  assert.deepEqual(scanProject(dir).sensitive, []);
});
