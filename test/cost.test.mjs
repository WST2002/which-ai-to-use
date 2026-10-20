import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startCost } from "../src/cost.mjs";

function project(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-cost-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

test("the cost to start adds the tool's instructions file, the suggested files and the prompt", (t) => {
  const dir = project(t, { "CLAUDE.md": "x".repeat(4000), "GEMINI.md": "x".repeat(400), "src/hero.tsx": "x".repeat(2000) });
  const cost = startCost({ dir, toolId: "claude-code", files: ["src/hero.tsx"], prompt: "x".repeat(40), addOns: 3 });
  assert.deepEqual(cost, { total: 1510, instructions: { file: "CLAUDE.md", tokens: 1000 }, files: 500, prompt: 10, addOns: 3 });
});

test("a tool without its own instructions file falls back to AGENTS.md, or nothing", (t) => {
  const withAgents = project(t, { "AGENTS.md": "x".repeat(800) });
  assert.deepEqual(startCost({ dir: withAgents, toolId: "codex", files: [], prompt: "", addOns: 0 }).instructions, { file: "AGENTS.md", tokens: 200 });
  const empty = project(t, {});
  assert.equal(startCost({ dir: empty, toolId: "claude-code", files: [], prompt: "abcd", addOns: 0 }).total, 1);
});
