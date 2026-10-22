import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { reportAction } from "../src/actions.mjs";

const NOW = new Date("2026-10-22T12:00:00");
const daysAgo = (days, hour = 10) => {
  const at = new Date(NOW);
  at.setDate(at.getDate() - days);
  at.setHours(hour, 0, 0, 0);
  return at.toISOString();
};

function home(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-report-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function write(file, text, ageDays = 0) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  const at = new Date(NOW.getTime() - ageDays * 86400000);
  fs.utimesSync(file, at, at);
}

const reply = (id, timestamp, cwd, tokens) =>
  JSON.stringify({ type: "assistant", timestamp, cwd, message: { id, role: "assistant", content: [{ type: "text", text: "never read" }], usage: { input_tokens: tokens, output_tokens: 0 } } });

test("the week's tokens per day, the change from the week before, limit hits and requests per AI", (t) => {
  const dir = home(t);
  const shop = path.join(os.tmpdir(), "shop");
  write(path.join(dir, ".claude", "projects", "shop", "a.jsonl"), [
    reply("old", daysAgo(10), shop, 100000),
    reply("m1", daysAgo(2), shop, 50000),
    reply("m2", daysAgo(0), shop, 70000),
    JSON.stringify({ type: "user", cwd: shop, message: { role: "user", content: "Add coupons" } }),
  ].join("\n"));
  write(path.join(dir, ".codex", "sessions", "2026", "10", "21", "rollout-1.jsonl"), [
    JSON.stringify({ type: "session_meta", payload: { cwd: shop } }),
    JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Validate coupons" }] } }),
    JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Add tests" }] } }),
  ].join("\n"), 1);
  write(path.join(dir, ".codex", "sessions", "2026", "10", "01", "rollout-old.jsonl"), JSON.stringify({ type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "old" }] } }), 21);
  write(path.join(dir, ".which-ai-to-use", "limits.jsonl"), `${JSON.stringify({ at: daysAgo(1) })}\n${JSON.stringify({ at: daysAgo(12) })}\n`);

  const { text, data } = reportAction({ home: dir, now: NOW });
  assert.equal(data.week.fresh, 120000);
  assert.equal(data.change, 20);
  assert.equal(data.days.length, 7);
  assert.equal(data.days.at(-1).fresh, 70000);
  assert.equal(data.busiest.fresh, 70000);
  assert.equal(data.limits, 1);
  assert.deepEqual(data.tools.map((t) => [t.tool, t.chats, t.requests]), [["claude-code", 1, 1], ["codex", 1, 2], ["gemini-cli", 0, 0]]);
  assert.match(text, /^Claude Code: ~120,000 tokens in 2 replies {2}\(↑ 20% vs the week before\)$/m);
  assert.match(text, /█+ +70k$/m);
  assert.match(text, /^Limit ran out: {4}1 time$/m);
  assert.match(text, /^Requests: +Claude Code 1 in 1 chat · Codex CLI 2 in 1 chat$/m);
  assert.equal(data.share, "My AI coding week: ~120k tokens with Claude Code, 2 Codex CLI requests. Tracked with which-ai-to-use: npx which-ai-to-use report");
  assert.match(data.links.x, /^https:\/\/x\.com\/intent\/post\?text=My%20AI%20coding%20week/);
  assert.doesNotMatch(JSON.stringify(data), /Add coupons|Validate coupons|never read/);
});

test("no AI use in the last 7 days says so", (t) => {
  assert.match(reportAction({ home: home(t), now: NOW }).text, /^No AI use found on this laptop in the last 7 days/);
});

test("one request is written as one request in the share line", (t) => {
  const dir = home(t);
  write(path.join(dir, ".gemini", "tmp", "abc", "chats", "session-1.json"), JSON.stringify({ projectHash: "abc", messages: [{ type: "user", content: "Make the cart responsive" }] }));
  assert.equal(reportAction({ home: dir, now: NOW }).data.share, "My AI coding week: 1 Gemini CLI request. Tracked with which-ai-to-use: npx which-ai-to-use report");
});
