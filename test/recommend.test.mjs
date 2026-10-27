import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { recommend, runCommandFor } from "../src/recommend.mjs";

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
  const result = recommend({ ...base, prefer: "free", installed: [found("claude-code"), found("antigravity-cli")] });
  assert.equal(result.best.id, "antigravity-cli");
  assert.equal(result.free.id, "antigravity-cli");
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
  assert.match(result.best.reason, /agent inside your editor/);
  assert.doesNotMatch(result.best.reason, /terminal agent/);
});

test("no tools installed suggests what to install", () => {
  const result = recommend({ ...base, installed: [] });
  assert.equal(result.best, null);
  assert.match(result.notes.join(" "), /No AI coding tools found/);
});

test("tools left out are named as left out, never as missing, and are not suggested again", () => {
  const none = recommend({ ...base, installed: [], leftOut: ["claude-code", "gemini-cli"] });
  assert.deepEqual(none.notes, ["All your AI tools are left out (Claude Code, Gemini CLI). Wait for a limit to reset, or try a free one: Antigravity CLI (free tier) or Ollama (local and private)."]);
  const one = recommend({ ...base, installed: [found("gemini-cli")], leftOut: ["claude-code"] });
  assert.doesNotMatch(one.notes.join(" "), /only AI tool found/);
  const risky = recommend({ ...base, categories: ["security-sensitive"], installed: [found("gemini-cli")], leftOut: ["claude-code"] });
  assert.deepEqual(risky.notes, ["Gemini CLI is the only AI tool you can use now, and this task is risky. Once a limit resets, ask another AI to review the change."]);
});

test("only one tool installed says so", () => {
  const result = recommend({ ...base, installed: [found("claude-code")] });
  assert.equal(result.best.id, "claude-code");
  assert.match(result.notes.join(" "), /only AI tool/);
});

test("a risky task with one tool gives one note about a second tool, not two", () => {
  const result = recommend({ ...base, categories: ["security-sensitive"], installed: [found("claude-code")] });
  assert.deepEqual(result.notes, ["Claude Code is the only AI tool found, and this task is risky. A second tool (for example Antigravity CLI, which has a free tier) can review the change."]);
});

test("sensitive files without any local tool say so instead of claiming local ranking", () => {
  const result = recommend({ ...base, sensitive: [".env"], installed: [found("claude-code")] });
  const notes = result.notes.join(" ");
  assert.match(notes, /\.env/);
  assert.doesNotMatch(notes, /ranked first/);
  assert.match(notes, /Ollama/);
});

test("Claude Code gets a cheaper model for small edits and the strongest for hard tasks", () => {
  const quick = recommend({ ...base, task: "fix a typo in the footer", categories: ["quick-edit"], installed: [found("claude-code")] });
  assert.equal(quick.best.command, 'claude --model haiku "fix a typo in the footer"');
  assert.match(quick.best.model, /haiku/);
  const hard = recommend({ ...base, task: "refactor auth", categories: ["refactor", "security-sensitive"], installed: [found("claude-code")] });
  assert.equal(hard.best.command, 'claude --model opus "refactor auth"');
  const typo = recommend({ ...base, task: "fix a typo in the footer", categories: ["bug-fix", "quick-edit"], installed: [found("claude-code")] });
  assert.equal(typo.best.command, 'claude --model haiku "fix a typo in the footer"');
  const bigQuick = recommend({ ...base, task: "x", categories: ["quick-edit", "multi-file-feature"], installed: [found("claude-code")] });
  assert.equal(bigQuick.best.model, undefined);
  const normal = recommend({ ...base, installed: [found("claude-code")] });
  assert.equal(normal.best.command, 'claude "add two-factor login"');
  assert.equal(normal.best.model, undefined);
});

test("each tool gets a reason written for this kind of task", () => {
  const ui = recommend({ ...base, task: "redesign the footer", categories: ["ui"], installed: [found("claude-code"), viaExtension("codex")] });
  assert.match(ui.best.why, /run your dev server/);
  const bug = recommend({ ...base, task: "fix the crash", categories: ["bug-fix"], installed: [found("claude-code")] });
  assert.match(bug.best.why, /run the failing/);
  const explain = recommend({ ...base, task: "explain this project", categories: ["explain-codebase"], installed: [found("gemini-cli")] });
  assert.match(explain.best.why, /most of your project at once/);
});

test("tools that are not installed but suit the task better are suggested", () => {
  const result = recommend({ ...base, task: "redesign the footer", categories: ["ui"], installed: [found("claude-code")] });
  const ids = result.suggested.map((s) => s.id);
  assert.ok(ids.includes("cursor"));
  assert.ok(!ids.includes("claude-code"));
  assert.ok(result.suggested.length <= 2);
  const cursor = result.suggested.find((s) => s.id === "cursor");
  assert.match(cursor.why, /design change right in the editor/);
  assert.equal(cursor.homepage, "https://cursor.com");
});

test("no suggestions when the best installed tool is already as good as any", () => {
  const result = recommend({ ...base, task: "fix the crash", categories: ["bug-fix"], installed: [found("claude-code")] });
  assert.deepEqual(result.suggested, []);
});

test("the best AI for the task is chosen from every tool, and says whether it is installed", () => {
  const result = recommend({ ...base, task: "redesign the footer", categories: ["ui"], installed: [found("claude-code"), viaExtension("codex")] });
  assert.equal(result.overall.id, "cursor");
  assert.equal(result.overall.installed, false);
  assert.match(result.overall.why, /design change right in the editor/);
  assert.equal(result.overall.homepage, "https://cursor.com");
  assert.deepEqual(result.overall.alsoGreat, ["GitHub Copilot", "Windsurf"]);
  assert.equal(result.best.id, "claude-code");
});

test("when an installed tool is as good as any, it is the overall pick", () => {
  const result = recommend({ ...base, task: "fix the crash", categories: ["bug-fix"], installed: [found("claude-code")] });
  assert.equal(result.overall.id, "claude-code");
  assert.equal(result.overall.installed, true);
});

test("a full Claude model id from an AI becomes the short alias the CLI takes", () => {
  assert.equal(runCommandFor(found("claude-code"), "tidy the hero", "claude-sonnet-5-5"), 'claude --model sonnet "tidy the hero"');
  assert.equal(runCommandFor(found("claude-code"), "tidy the hero", "Haiku"), 'claude --model haiku "tidy the hero"');
  assert.equal(runCommandFor(found("claude-code"), "tidy the hero", "gpt-6"), 'claude "tidy the hero"');
});

test("handoff choices put the recommended AI first, then the others, the web and nothing", async () => {
  const { handoffChoices } = await import("../src/actions.mjs");
  const next = recommend({ ...base, task: "Read HANDOFF.md and continue the task.", installed: [found("gemini-cli"), found("codex"), viaExtension("github-copilot")] });
  const choices = handoffChoices(next);
  assert.deepEqual(choices.slice(-3).map((c) => c.id), ["web", "other", "none"]);
  assert.equal(choices[0].id, next.best.id);
  const suggested = handoffChoices(next, { id: "aider", name: "Aider", why: "a general coding assistant", command: "aider", install: "python -m pip install aider-install && aider-install" });
  const aider = suggested.find((c) => c.id === "aider");
  assert.deepEqual([aider.installed, aider.recommended, aider.install], [false, false, "python -m pip install aider-install && aider-install"]);
  assert.match(aider.why, /not installed yet$/);
  assert.equal(handoffChoices(next, { id: next.best.id, name: "x", why: "y", command: "z" }).filter((c) => c.id === next.best.id).length, 1, "an installed AI is never also suggested");
  assert.equal(choices.filter((c) => c.recommended).length, 1);
  assert.ok(choices[0].recommended);
  assert.ok(!choices.some((c) => c.id === "github-copilot"), "editor-only tools cannot be started from a terminal");
  assert.ok(handoffChoices(recommend({ ...base, installed: [] })).find((c) => c.id === "web").recommended);
});

test("a task or file name can never break out of the quotes in the command", () => {
  const task = 'fix the "Terms & Conditions" link; $(touch PWNED) `touch PWNED` %PATH% costs $5!\nnext line \\';
  const { command } = recommend({ ...base, task, installed: [found("claude-code")] }).best;
  assert.equal(command, `claude "fix the 'Terms & Conditions' link; (touch PWNED) 'touch PWNED' PATH costs 5 next line "`);
});

test("the quoted task reaches the program as one argument in the system shell, and runs nothing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-quote-"));
  const echo = path.join(dir, "echo.cjs");
  fs.writeFileSync(echo, "process.stdout.write(JSON.stringify(process.argv.slice(2)))");
  const task = 'add "coupons" & $(touch PWNED) `touch PWNED` %PATH%';
  const { command } = recommend({ ...base, task, installed: [found("claude-code")] }).best;
  const run = command.replace(/^claude /, `"${process.execPath}" "${echo}" `);
  const result = spawnSync(run, { cwd: dir, shell: true, encoding: "utf8" });
  assert.deepEqual(JSON.parse(result.stdout), ["add 'coupons' & (touch PWNED) 'touch PWNED' PATH"]);
  assert.ok(!fs.existsSync(path.join(dir, "PWNED")));
});
