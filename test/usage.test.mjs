import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { claudeUsage } from "../src/usage.mjs";

const NOW = new Date("2026-10-20T12:00:00Z");

const line = (id, timestamp, cwd, usage) =>
  JSON.stringify({ type: "assistant", timestamp, cwd, message: { id, role: "assistant", content: [{ type: "text", text: "never read" }], usage } });

function home(t, sessions) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-usage-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [file, lines] of Object.entries(sessions)) {
    const full = path.join(dir, ".claude", "projects", file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, `${lines.join("\n")}\n`);
  }
  return dir;
}

test("sums today and the last 7 days from Claude Code's local logs, once per message", (t) => {
  const u = (input, output, created = 0, read = 0) => ({ input_tokens: input, output_tokens: output, cache_creation_input_tokens: created, cache_read_input_tokens: read });
  const dir = home(t, {
    "C--work-shop/a.jsonl": [
      line("m1", "2026-10-20T09:00:00Z", "C:\\work\\shop", u(100, 50, 200, 1000)),
      line("m1", "2026-10-20T09:00:01Z", "C:\\work\\shop", u(100, 50, 200, 1000)),
      line("m2", "2026-10-18T09:00:00Z", "C:\\work\\shop", u(10, 5)),
      JSON.stringify({ type: "user", timestamp: "2026-10-20T09:00:00Z", message: { content: "hi" } }),
      "not json",
    ],
    "C--work-blog/b.jsonl": [line("m3", "2026-10-20T10:00:00Z", "C:\\work\\blog", u(1, 1)), line("m4", "2026-09-01T10:00:00Z", "C:\\work\\blog", u(999, 999))],
  });
  const usage = claudeUsage({ home: dir, now: NOW });
  assert.deepEqual(usage.today, { fresh: 352, cached: 1000, replies: 2 });
  assert.deepEqual(usage.week, { fresh: 367, cached: 1000, replies: 3 });
  assert.deepEqual(usage.projects, [{ project: "shop", fresh: 365 }, { project: "blog", fresh: 2 }]);
  assert.equal(usage.found, true);
});

test("no logs means no usage, not an error", (t) => {
  const dir = home(t, {});
  assert.deepEqual(claudeUsage({ home: dir, now: NOW }), { found: false, today: { fresh: 0, cached: 0, replies: 0 }, week: { fresh: 0, cached: 0, replies: 0 }, projects: [], window: null, pace: null, limit: null });
});

const u = (input, output) => ({ input_tokens: input, output_tokens: output });

test("estimates the current 5-hour window from the first reply in it, starting on the hour", (t) => {
  const dir = home(t, {
    "p/a.jsonl": [
      line("old", "2026-10-20T03:10:00Z", "C:\p", u(500, 500)),
      line("w1", "2026-10-20T09:20:00Z", "C:\p", u(100, 20)),
      line("w2", "2026-10-20T11:45:00Z", "C:\p", u(30, 10)),
    ],
  });
  const { window } = claudeUsage({ home: dir, now: NOW });
  assert.deepEqual(window, { start: Date.parse("2026-10-20T09:00:00Z"), end: Date.parse("2026-10-20T14:00:00Z"), fresh: 160, replies: 2 });
});

test("a reply after the window ends starts a new one", (t) => {
  const dir = home(t, { "p/a.jsonl": [line("a", "2026-10-20T04:30:00Z", "C:\p", u(1, 1)), line("b", "2026-10-20T10:05:00Z", "C:\p", u(5, 5))] });
  assert.equal(claudeUsage({ home: dir, now: NOW }).window.start, Date.parse("2026-10-20T10:00:00Z"));
});

test("no reply in the last 5 hours means no open window", (t) => {
  const dir = home(t, { "p/a.jsonl": [line("a", "2026-10-20T05:30:00Z", "C:\p", u(1, 1))] });
  assert.equal(claudeUsage({ home: dir, now: NOW }).window, null);
});

test("the window line gives the reset time and what is left, or how a new window starts", async () => {
  const { windowLine } = await import("../src/format.mjs");
  const window = { start: Date.parse("2026-10-20T09:00:00Z"), end: Date.parse("2026-10-20T14:00:00Z"), fresh: 1200, replies: 4 };
  assert.match(windowLine(window, new Date("2026-10-20T12:48:00Z")), /^~1,200 tokens in 4 replies since \d\d:\d\d · resets about \d\d:\d\d \(in 1 h 12 min\)$/);
  assert.match(windowLine(window, new Date("2026-10-20T13:59:40Z")), /\(in 1 min\)$/);
  assert.equal(windowLine(null), "No 5-hour window is open: your next Claude message starts a fresh one.");
});

// Replies spread over a window: `tokens` in total, starting at `at`.
const burst = (prefix, at, tokens, count = 4) =>
  Array.from({ length: count }, (_, i) => line(`${prefix}${i}`, new Date(Date.parse(at) + i * 10 * 60000).toISOString(), "C:\p", u(tokens / count, 0)));

test("warns when this window nears the busiest window of the week", async (t) => {
  const { limitWarning } = await import("../src/format.mjs");
  const dir = home(t, { "p/a.jsonl": [...burst("old", "2026-10-18T09:00:00Z", 100000), ...burst("now", "2026-10-20T10:00:00Z", 85000)] });
  const usage = claudeUsage({ home: dir, now: NOW });
  assert.deepEqual(usage.limit, { tokens: 100000, source: "busiest" });
  assert.match(limitWarning(usage, []), /^This window is at 85% of your busiest 5-hour window this week \(~100,000 tokens\); it resets about \d\d:\d\d\. Send small tasks to Claude with --model haiku/);
  assert.match(limitWarning(usage, [{ id: "antigravity-cli" }]), /Send small tasks to Antigravity CLI \(free\)/);
});

test("a recorded limit hit is the better reference, and low use gives no warning", async (t) => {
  const { limitWarning } = await import("../src/format.mjs");
  const dir = home(t, { "p/a.jsonl": [...burst("old", "2026-10-18T09:00:00Z", 200000), ...burst("hit", "2026-10-19T09:00:00Z", 90000), ...burst("now", "2026-10-20T10:00:00Z", 80000)] });
  fs.mkdirSync(path.join(dir, ".which-ai-to-use"));
  fs.writeFileSync(path.join(dir, ".which-ai-to-use", "limits.jsonl"), `${JSON.stringify({ at: "2026-10-19T09:35:00Z" })}\n`);
  const usage = claudeUsage({ home: dir, now: NOW });
  assert.deepEqual(usage.limit, { tokens: 90000, source: "limit" });
  assert.match(limitWarning(usage, []), /89% of what you had used when your limit ran out last time \(~90,000 tokens\)/);
  const quiet = home(t, { "p/a.jsonl": [...burst("old", "2026-10-18T09:00:00Z", 100000), ...burst("now", "2026-10-20T10:00:00Z", 30000)] });
  assert.equal(limitWarning(claudeUsage({ home: quiet, now: NOW }), []), null);
});

test("a log that cannot be read is skipped, not an error", (t) => {
  const dir = home(t, { "shop/a.jsonl": [line("m1", "2026-10-20T10:00:00Z", "/shop", u(100, 20))] });
  try {
    fs.symlinkSync(path.join(dir, "missing.jsonl"), path.join(dir, ".claude", "projects", "shop", "gone.jsonl"));
  } catch {
    t.skip("this system cannot create symlinks");
    return;
  }
  assert.equal(claudeUsage({ home: dir, now: NOW }).today.fresh, 120);
});

test("close to the limit, usage says how to make the window last, each with a command", async (t) => {
  const { usageAction } = await import("../src/actions.mjs");
  const dir = home(t, { "p/a.jsonl": [...burst("old", "2026-10-18T09:00:00Z", 100000), ...burst("now", "2026-10-20T10:00:00Z", 85000)] });
  const installed = [{ id: "claude-code", onPath: true, via: ["command: claude"] }, { id: "antigravity-cli", onPath: true, via: ["command: agy"] }];
  const { text, data } = usageAction({ home: dir, installed, now: NOW });
  assert.match(text, /To make it last:\n {2}• Shrink the conversation, so every message costs less: \/compact \(in Claude Code\)/);
  assert.match(text, /• Use the small model for small edits: claude --model haiku "your task"/);
  assert.match(text, /• Send the next task to another AI, like Antigravity CLI \(free\): npx which-ai-to-use "your task" --without claude-code/);
  assert.equal(data.tips.length, 4);
  const quiet = home(t, { "p/a.jsonl": [...burst("now", "2026-10-20T10:00:00Z", 30000)] });
  assert.deepEqual(usageAction({ home: quiet, installed, now: NOW }).data.tips, []);
});

// Three replies in the last half hour before NOW (11:30, 11:40, 11:50), `tokens` each, in a window that opened at 11:00.
const lastHalfHour = (tokens) => [10, 20, 30].map((minutes) => line(`pace${minutes}`, new Date(NOW.getTime() - minutes * 60000).toISOString(), "C:\\p", u(tokens, 0)));

test("the pace of the last half hour says when the limit is reached, if that comes before the reset", async (t) => {
  const { etaLine, limitEta, limitWarning } = await import("../src/format.mjs");
  const dir = home(t, { "p/a.jsonl": [...burst("old", "2026-10-18T09:00:00Z", 100000), ...lastHalfHour(10000)] });
  const usage = claudeUsage({ home: dir, now: NOW });
  assert.deepEqual(usage.pace, { perMinute: 1000, at: NOW.getTime() });
  assert.deepEqual(limitEta(usage), { at: NOW.getTime() + 70 * 60000, minutes: 70 });
  assert.match(etaLine(usage), /^At this pace you reach your busiest 5-hour window this week about \d\d:\d\d \(in 1 h 10 min\), before it resets\.$/);
  assert.equal(limitWarning(usage, []), null, "70 minutes away and at 30%: no warning yet");
});

test("reaching the limit within half an hour warns even below 80%, with the time", async (t) => {
  const { limitWarning } = await import("../src/format.mjs");
  const dir = home(t, { "p/a.jsonl": [...burst("old", "2026-10-18T09:00:00Z", 100000), ...lastHalfHour(20000)] });
  assert.match(limitWarning(claudeUsage({ home: dir, now: NOW }), []), /^This window is at 60% of your busiest 5-hour window this week \(~100,000 tokens\); it resets about \d\d:\d\d\. At this pace you reach it about \d\d:\d\d \(in 20 min\)\. Send small tasks/);
});

test("no estimate after a break, from one reply, or when the reset comes first", async (t) => {
  const { limitEta } = await import("../src/format.mjs");
  const old = burst("old", "2026-10-18T09:00:00Z", 100000);
  const onBreak = home(t, { "p/a.jsonl": [...old, ...burst("now", "2026-10-20T10:00:00Z", 60000)] });
  assert.equal(claudeUsage({ home: onBreak, now: NOW }).pace, null);
  const once = home(t, { "p/a.jsonl": [...old, line("one", "2026-10-20T11:50:00Z", "C:\\p", u(50000, 0))] });
  assert.equal(claudeUsage({ home: once, now: NOW }).pace, null);
  const slow = home(t, { "p/a.jsonl": [...old, ...lastHalfHour(1000)] });
  const usage = claudeUsage({ home: slow, now: NOW });
  assert.equal(usage.pace.perMinute, 100);
  assert.equal(limitEta(usage), null, "970 minutes away: the window resets first");
});

test("usage shows the estimate as a line of its own when there is no warning", async (t) => {
  const { usageAction } = await import("../src/actions.mjs");
  const dir = home(t, { "p/a.jsonl": [...burst("old", "2026-10-18T09:00:00Z", 100000), ...lastHalfHour(10000)] });
  const { text, data } = usageAction({ home: dir, installed: [], now: NOW });
  assert.match(text, /\n {2}At this pace you reach your busiest 5-hour window this week about \d\d:\d\d \(in 1 h 10 min\), before it resets\.\n/);
  assert.equal(data.eta.minutes, 70);
  assert.match(data.etaText, /^At this pace/);
});

