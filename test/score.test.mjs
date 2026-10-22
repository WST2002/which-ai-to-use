import { test } from "node:test";
import assert from "node:assert/strict";
import { setupScore } from "../src/score.mjs";

const tool = (id, name) => ({ id, name, onPath: true, via: [`command: ${id}`] });
const clean = { rules: [{ file: "CLAUDE.md", tokens: 800, large: false, sections: [] }], heavy: [], ignore: [], mcp: [] };

test("a tidy setup with two tools and a test command scores 100", () => {
  const result = setupScore({ report: clean, installed: [tool("claude-code", "Claude Code"), tool("gemini-cli", "Gemini CLI")], verify: "npm test" });
  assert.equal(result.score, 100);
  assert.equal(result.grade, "A");
  assert.deepEqual(result.items, []);
});

test("each problem costs points, with a tip, and the score never drops below 0", () => {
  const report = {
    rules: [{ file: "CLAUDE.md", tokens: 6000, large: true, sections: [] }],
    heavy: [{ file: "package-lock.json", tokens: 58000 }],
    ignore: [{ id: "claude-code" }],
    mcp: [{ tool: "Claude Code", name: "a" }, { tool: "Claude Code", name: "b" }, { tool: "Claude Code", name: "c" }],
  };
  const result = setupScore({ report, installed: [tool("claude-code", "Claude Code")], verify: null });
  assert.deepEqual(result.items.map((i) => [i.id, i.points]), [
    ["instructions-long", -15],
    ["heavy-files", -15],
    ["add-ons", -9],
    ["one-tool", -5],
    ["no-tests", -5],
  ]);
  assert.equal(result.score, 51);
  assert.equal(result.grade, "D");
  assert.ok(result.items.every((i) => i.tip.length > 10));
  assert.equal(result.saving, 58000 + 6000 - 2000);
});

test("no instructions file at all is its own problem", () => {
  const result = setupScore({ report: { ...clean, rules: [] }, installed: [tool("claude-code", "Claude Code"), tool("codex", "Codex CLI")], verify: "npm test" });
  assert.deepEqual(result.items.map((i) => i.id), ["no-instructions"]);
  assert.equal(result.score, 90);
  assert.equal(result.grade, "A");
});

test("the share line is ready to post", () => {
  const result = setupScore({ report: clean, installed: [tool("claude-code", "Claude Code")], verify: "npm test" });
  assert.match(result.share, /^My AI coding setup scored 95\/100 \(A\) with which-ai-to-use\./);
  assert.match(result.share, /npx which-ai-to-use score$/);
});

test("share links open a post with the score line and the repository", async () => {
  const { shareLinks } = await import("../src/actions.mjs");
  const links = shareLinks("My AI coding setup scored 77/100 (B) with which-ai-to-use.");
  assert.match(links.x, /^https:\/\/x\.com\/intent\/post\?text=My%20AI%20coding%20setup%20scored%2077%2F100%20\(B\)/);
  assert.match(decodeURIComponent(links.linkedin.split("text=")[1]), /scored 77\/100 \(B\) with which-ai-to-use\. https:\/\/github\.com\/WST2002\/which-ai-to-use$/);
  assert.match(links.linkedin, /^https:\/\/www\.linkedin\.com\/feed\/\?shareActive=true&text=/);
});
