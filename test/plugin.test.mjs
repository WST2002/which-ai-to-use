import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const hook = path.join(root, "claude-plugin", "scripts", "on-limit.mjs");
const gitDir = () => path.dirname(spawnSync(process.platform === "win32" ? "where" : "which", ["git"], { encoding: "utf8" }).stdout.split(/\r?\n/)[0]);

// A machine with a git project, a home folder and a stand-in which-ai-to-use that logs how it was called.
function machine(t, { git = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-plugin-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const [bin, home, project] = ["bin", "home", "project"].map((name) => path.join(dir, name));
  for (const folder of [bin, home, project]) fs.mkdirSync(folder);
  const log = path.join(dir, "calls.log");
  if (process.platform === "win32") fs.writeFileSync(path.join(bin, "which-ai-to-use.cmd"), `@echo off\r\necho %* by=%WHICH_AI_TO_USE_BY%>>"${log}"\r\n`);
  else {
    fs.writeFileSync(path.join(bin, "which-ai-to-use"), `#!/bin/sh\necho "$@" by=$WHICH_AI_TO_USE_BY >> "${log}"\n`);
    fs.chmodSync(path.join(bin, "which-ai-to-use"), 0o755);
  }
  if (git) spawnSync("git", ["init", "-q"], { cwd: project });
  const run = (input) =>
    spawnSync(process.execPath, [hook], {
      input: JSON.stringify({ session_id: "s1", cwd: project, ...input }),
      env: { ...process.env, PATH: [bin, gitDir()].join(path.delimiter), HOME: home, USERPROFILE: home },
      encoding: "utf8",
    });
  const limits = () => {
    const file = path.join(home, ".which-ai-to-use", "limits.jsonl");
    return fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [];
  };
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "");
  return { run, limits, calls, project };
}

test("a usage limit records the time and writes the handoff note, copied", (t) => {
  const { run, limits, calls } = machine(t);
  const result = run({ hook_event_name: "StopFailure", error: "rate_limit", last_assistant_message: "Claude usage limit reached. Your limit will reset at 6pm." });
  assert.equal(result.status, 0, result.stderr);
  const [hit] = limits();
  assert.equal(hit.session, "s1");
  assert.ok(Date.now() - Date.parse(hit.at) < 60000);
  assert.match(calls(), /handoff --to none --copy by=hook/);
});

const LIMIT_HIT = { hook_event_name: "StopFailure", error: "rate_limit", last_assistant_message: "You've hit your limit · resets 6pm" };

test("messages sent while the limit is still over do not write the note again", (t) => {
  const { run, limits, calls, project } = machine(t);
  const later = new Date(Date.now() + 60 * 60000).toISOString();
  fs.writeFileSync(path.join(project, "HANDOFF.md"), `# Handoff

Task: add coupons

<!-- which-ai-to-use: from=claude-code by=hook resets=${later} -->
`);
  run(LIMIT_HIT);
  assert.deepEqual(limits(), []);
  assert.equal(calls(), "");
});

test("once the limit has reset, the next limit writes a new note", (t) => {
  const { run, calls, project } = machine(t);
  const earlier = new Date(Date.now() - 60 * 60000).toISOString();
  fs.writeFileSync(path.join(project, "HANDOFF.md"), `# Handoff

<!-- which-ai-to-use: from=claude-code by=hook resets=${earlier} -->
`);
  run(LIMIT_HIT);
  assert.match(calls(), /handoff --to none --copy/);
});

test("a short per-minute rate limit is not the usage limit", (t) => {
  const { run, limits, calls } = machine(t);
  run({ hook_event_name: "StopFailure", error: "rate_limit", last_assistant_message: "API Error: 429 rate_limit_error: Number of request tokens has exceeded your per-minute rate limit" });
  assert.deepEqual(limits(), []);
  assert.equal(calls(), "");
});

test("a limit message with another error type still counts", (t) => {
  const { run, limits } = machine(t);
  run({ hook_event_name: "StopFailure", error: "unknown", last_assistant_message: "5-hour limit reached ∙ resets 6pm" });
  assert.equal(limits().length, 1);
});

test("other failures and other events do nothing", (t) => {
  const { run, limits, calls } = machine(t);
  run({ hook_event_name: "StopFailure", error: "overloaded", last_assistant_message: "API Error: Overloaded" });
  run({ hook_event_name: "Stop", error: "rate_limit" });
  assert.deepEqual(limits(), []);
  assert.equal(calls(), "");
});

test("outside a git project the note is written in the folder Claude worked in", (t) => {
  const { run, limits, calls } = machine(t, { git: false });
  run({ hook_event_name: "StopFailure", error: "rate_limit", last_assistant_message: "usage limit reached" });
  assert.equal(limits().length, 1);
  assert.match(calls(), /handoff --to none --copy by=hook/);
});

test("the plugin and the marketplace describe the same plugin", () => {
  const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
  const marketplace = read(".claude-plugin/marketplace.json");
  const plugin = read("claude-plugin/.claude-plugin/plugin.json");
  const [entry] = marketplace.plugins;
  assert.equal(entry.name, plugin.name);
  assert.equal(entry.version, plugin.version);
  assert.equal(entry.source, "./claude-plugin");
  const hooks = read("claude-plugin/hooks/hooks.json").hooks;
  assert.deepEqual(Object.keys(hooks), ["StopFailure"]);
  assert.equal(entry.description, plugin.description);
});

test("/handoff writes the note with the tool, then has Claude add its own notes, with only those tools allowed", () => {
  const text = fs.readFileSync(path.join(root, "claude-plugin", "commands", "handoff.md"), "utf8");
  const [, front, body] = /^---\n([\s\S]+?)\n---\n([\s\S]+)$/.exec(text.replace(/\r\n/g, "\n"));
  assert.match(front, /^description: .+$/m);
  assert.match(front, /^argument-hint: /m);
  assert.equal(/^allowed-tools: (.+)$/m.exec(front)[1], "Bash(which-ai-to-use handoff:*), Bash(npx -y which-ai-to-use@latest handoff:*), Read, Edit");
  assert.match(body, /handoff --to none/);
  assert.match(body, /\$ARGUMENTS/);
  assert.match(body, /## Notes from Claude/);
  assert.match(body, /Never put passwords, keys or tokens in it\./);
});
