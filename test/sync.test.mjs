import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { applySync, planSync } from "../src/sync.mjs";

function project(t, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-sync-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}
const read = (dir, file) => fs.readFileSync(path.join(dir, file), "utf8");
const RULES = "# Rules\n\n- Use TypeScript strict mode.\n- Run npm test before committing.\n";

test("uses AGENTS.md as the source and plans files for the chosen tools", (t) => {
  const dir = project(t, { "AGENTS.md": RULES });
  const plan = planSync(dir, { targets: ["CLAUDE.md", "GEMINI.md"] });
  assert.equal(plan.source, "AGENTS.md");
  assert.deepEqual(plan.items.map((i) => `${i.file}:${i.status}`), ["CLAUDE.md:create", "GEMINI.md:create"]);
});

test("falls back to another existing rules file as the source", (t) => {
  const dir = project(t, { "CLAUDE.md": RULES });
  assert.equal(planSync(dir, { targets: ["AGENTS.md"] }).source, "CLAUDE.md");
});

test("no rules file at all is an error with a fix", (t) => {
  const dir = project(t);
  assert.throws(() => planSync(dir, { targets: ["CLAUDE.md"] }), /No rules file found\. Create AGENTS\.md/);
});

test("writes the same rules everywhere, with a sync note and Cursor frontmatter", (t) => {
  const dir = project(t, { "AGENTS.md": RULES });
  applySync(dir, planSync(dir, { targets: ["CLAUDE.md", ".cursor/rules/project.mdc"] }));
  assert.match(read(dir, "CLAUDE.md"), /Synced from AGENTS\.md by which-ai-to-use/);
  assert.ok(read(dir, "CLAUDE.md").endsWith(RULES));
  assert.match(read(dir, ".cursor/rules/project.mdc"), /^---\ndescription: .+\nalwaysApply: true\n---\n/);
  assert.ok(read(dir, ".cursor/rules/project.mdc").endsWith(RULES));
});

test("files already in sync are left alone; synced files are updated", (t) => {
  const dir = project(t, { "AGENTS.md": RULES });
  applySync(dir, planSync(dir, { targets: ["CLAUDE.md"] }));
  assert.equal(planSync(dir, { targets: ["CLAUDE.md"] }).items[0].status, "same");
  fs.appendFileSync(path.join(dir, "AGENTS.md"), "- New rule.\n");
  assert.equal(planSync(dir, { targets: ["CLAUDE.md"] }).items[0].status, "update");
});

test("hand-written files that differ are not overwritten without permission", (t) => {
  const dir = project(t, { "AGENTS.md": RULES, "GEMINI.md": "my own gemini notes\n" });
  const plan = planSync(dir, { targets: ["GEMINI.md"] });
  assert.equal(plan.items[0].status, "differs");
  applySync(dir, plan);
  assert.equal(read(dir, "GEMINI.md"), "my own gemini notes\n");
  applySync(dir, plan, { overwrite: true });
  assert.ok(read(dir, "GEMINI.md").endsWith(RULES));
});

test("the source file itself is never a target", (t) => {
  const dir = project(t, { "AGENTS.md": RULES });
  assert.deepEqual(planSync(dir, { targets: ["AGENTS.md", "CLAUDE.md"] }).items.map((i) => i.file), ["CLAUDE.md"]);
});
