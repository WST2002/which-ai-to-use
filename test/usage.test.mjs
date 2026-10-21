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
  assert.deepEqual(claudeUsage({ home: dir, now: NOW }), { found: false, today: { fresh: 0, cached: 0, replies: 0 }, week: { fresh: 0, cached: 0, replies: 0 }, projects: [], window: null });
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
