import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { aiAction } from "../src/actions.mjs";
import { aiRunner, buildAiPrompt, parseAiAnswer } from "../src/ai.mjs";

const found = (id, extra = {}) => ({ id, name: id, onPath: true, via: [`command: ${id}`], ...extra });

test("the prompt sends the task, tool names and file names, never file contents", () => {
  const prompt = buildAiPrompt({
    task: "make the hero look better",
    labels: ["design (UI)"],
    installed: [found("claude-code", { name: "Claude Code" })],
    files: ["src/Hero.tsx"],
    verify: "npm test",
    rules: { overall: "cursor", best: "claude-code" },
  });
  assert.match(prompt, /make the hero look better/);
  assert.match(prompt, /Installed on this laptop: claude-code \(Claude Code\)/);
  assert.match(prompt, /cursor: agent, inline/);
  assert.match(prompt, /src\/Hero\.tsx/);
  assert.match(prompt, /Reply with only this JSON/);
  assert.doesNotMatch(prompt, /export default|function Hero/);
});

test("the answer is read from JSON inside any extra text, and checked against real tools", () => {
  const text = 'Sure!\n```json\n{"best_anywhere":"cursor","best_installed":"claude-code","model":"sonnet","why":"Visual work.","prompt":"Improve Hero.tsx spacing","steps":["Open Hero.tsx","Run npm test"]}\n```';
  const answer = parseAiAnswer(text, { installedIds: ["claude-code"] });
  assert.deepEqual(answer, { bestAnywhere: "cursor", bestInstalled: "claude-code", model: "sonnet", why: "Visual work.", prompt: "Improve Hero.tsx spacing", steps: ["Open Hero.tsx", "Run npm test"] });
});

test("answers naming unknown or uninstalled tools, or not JSON at all, are rejected", () => {
  assert.equal(parseAiAnswer('{"best_anywhere":"chatgpt","best_installed":"claude-code","why":"x","prompt":"y","steps":[]}', { installedIds: ["claude-code"] }), null);
  assert.equal(parseAiAnswer('{"best_anywhere":"cursor","best_installed":"cursor","why":"x","prompt":"y","steps":[]}', { installedIds: ["claude-code"] }), null);
  assert.equal(parseAiAnswer("I think Cursor is best.", { installedIds: ["claude-code"] }), null);
});

test("the AI to ask is local first, then a command-line AI; editor-only tools cannot be asked", () => {
  assert.equal(aiRunner([found("claude-code"), found("ollama", { models: ["qwen2.5-coder:7b"] })]).id, "ollama");
  assert.equal(aiRunner([found("ollama", { models: [] }), found("claude-code")]).id, "claude-code");
  assert.equal(aiRunner([{ id: "codex", onPath: true, via: ["extension: openai.chatgpt"] }]), null);
  const claude = aiRunner([found("claude-code")]);
  assert.deepEqual(claude.args, ["-p", "--tools", "", "--strict-mcp-config", "--model", "haiku"]);
});

test("without consent nothing is sent; with it the AI's answer is shown next to the rules", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-aiact-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "Hero.tsx"), "x");
  const installed = [{ id: "claude-code", name: "Claude Code", onPath: true, via: ["command: claude"] }];
  let asked = 0;
  const reply = (text) => async () => { asked++; return { ok: true, text, seconds: 3 }; };

  const preview = await aiAction({ cwd: dir, home: dir, task: "make the hero look better", installed, ask: reply("{}") });
  assert.equal(asked, 0);
  assert.equal(preview.data.needsConsent, true);
  assert.match(preview.text, /not their contents/);

  const good = '{"best_anywhere":"cursor","best_installed":"claude-code","model":"sonnet","why":"Visual changes.","prompt":"Tidy the spacing in src/Hero.tsx","steps":["Open Hero.tsx"]}';
  const answered = await aiAction({ cwd: dir, home: dir, task: "make the hero look better", installed, consent: true, ask: reply(good) });
  assert.equal(asked, 1);
  assert.match(answered.text, /🤖 Answer from Claude Code \(asked with no tools\) · 3 s/);
  assert.match(answered.text, /① Best AI for this task: Cursor ✗ not on your laptop/);
  assert.match(answered.text, /Run:\s+claude --model sonnet "Tidy the spacing in src\/Hero\.tsx"/);
  assert.match(answered.text, /Rules answer: Cursor \/ Claude Code \(the AI agrees\)/);

  const fallback = await aiAction({ cwd: dir, home: dir, task: "make the hero look better", installed, consent: true, ask: reply("no idea") });
  assert.match(fallback.text, /did not give a usable answer, so here is the rules answer/);
  assert.match(fallback.text, /① Best AI for this task \(any tool\)/);
});
