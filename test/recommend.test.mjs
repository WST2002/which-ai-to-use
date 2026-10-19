import { test } from "node:test";
import assert from "node:assert/strict";
import { recommend } from "../src/recommend.mjs";

const found = (id, extra = {}) => ({ id, onPath: true, via: [`command: ${id}`], ...extra });
const viaExtension = (id) => ({ id, onPath: true, via: [`extension: x`] });
const base = { task: "add two-factor login", categories: ["multi-file-feature"], sensitive: [] };

test("recommends an installed terminal agent with a reason and a runnable command", () => {
  const result = recommend({ ...base, installed: [found("claude-code"), found("github-copilot")] });
  assert.equal(result.best.id, "claude-code");
  assert.match(result.best.reason, /terminal agent/i);
  assert.equal(result.best.command, 'claude "add two-factor login"');
});

test("quick edits prefer an inline editor tool", () => {
  const result = recommend({ ...base, task: "rename this variable", categories: ["quick-edit"], installed: [found("claude-code"), viaExtension("github-copilot")] });
  assert.equal(result.best.id, "github-copilot");
});

test("explaining a codebase prefers a large context window", () => {
  const result = recommend({ ...base, categories: ["explain-codebase"], installed: [found("codex"), found("gemini-cli")] });
  assert.equal(result.best.id, "gemini-cli");
});

test("prefer free ranks free tools first", () => {
  const result = recommend({ ...base, prefer: "free", installed: [found("claude-code"), found("gemini-cli")] });
  assert.equal(result.best.id, "gemini-cli");
  assert.equal(result.free.id, "gemini-cli");
});

test("sensitive files put local tools first and flag cloud tools", () => {
  const result = recommend({ ...base, sensitive: [".env"], installed: [found("claude-code"), found("ollama", { models: ["qwen2.5-coder:7b"] })] });
  assert.equal(result.best.id, "ollama");
  assert.equal(result.best.command, 'ollama run qwen2.5-coder:7b "add two-factor login"');
  assert.match(result.notes.join(" "), /\.env/);
  assert.match(result.also.find((a) => a.id === "claude-code").reason, /sends code to a cloud service/);
});

test("risky tasks get a second opinion from a different tool", () => {
  const result = recommend({ ...base, categories: ["multi-file-feature", "security-sensitive"], installed: [found("claude-code"), found("codex")] });
  assert.ok(result.reviewer);
  assert.notEqual(result.reviewer.id, result.best.id);
  assert.match(result.reviewer.command, /Review/);
});

test("a tool found only as an editor extension gets editor instructions, not a CLI command", () => {
  const result = recommend({ ...base, installed: [viaExtension("codex")] });
  assert.equal(result.best.id, "codex");
  assert.doesNotMatch(result.best.command, /^codex "/);
  assert.match(result.best.command, /VS Code/);
});

test("no tools installed suggests what to install", () => {
  const result = recommend({ ...base, installed: [] });
  assert.equal(result.best, null);
  assert.match(result.notes.join(" "), /No AI coding tools found/);
});

test("only one tool installed says so", () => {
  const result = recommend({ ...base, installed: [found("claude-code")] });
  assert.equal(result.best.id, "claude-code");
  assert.match(result.notes.join(" "), /only AI tool/);
});
