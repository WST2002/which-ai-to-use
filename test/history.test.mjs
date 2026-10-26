import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TASK_LOG, recentTasks, recordTask } from "../src/history.mjs";
import { recentAction } from "../src/actions.mjs";
import { runAction } from "../src/dashboard.mjs";

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-history-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const at = (minute) => new Date(Date.UTC(2026, 9, 26, 10, minute));

test("tasks come back newest first, for this project only, and asking again moves a task to the top", (t) => {
  const home = tempDir(t);
  const shop = path.join(home, "shop");
  recordTask(home, { cwd: shop, task: "add a coupon field", best: "Claude Code", at: at(1) });
  recordTask(home, { cwd: path.join(home, "blog"), task: "fix the footer", best: "Codex", at: at(2) });
  recordTask(home, { cwd: shop, task: "write tests for the cart", best: null, at: at(3) });
  recordTask(home, { cwd: shop, task: "Add a  coupon field ", best: "Gemini CLI", at: at(4) });
  assert.deepEqual(recentTasks(home, shop), [
    { at: at(4).toISOString(), task: "Add a coupon field", best: "Gemini CLI" },
    { at: at(3).toISOString(), task: "write tests for the cart", best: null },
  ]);
});

test("secrets in a task are hidden before it is saved, and empty tasks are not saved", (t) => {
  const home = tempDir(t);
  const key = ["sk", "live", "abcdefghijklmnopqrstuvwx"].join("_");
  recordTask(home, { cwd: home, task: `use ${key} for payments` });
  recordTask(home, { cwd: home, task: "   " });
  const saved = fs.readFileSync(path.join(home, ...TASK_LOG), "utf8");
  assert.doesNotMatch(saved, new RegExp(key));
  assert.equal(recentTasks(home, home).length, 1);
});

test("only the newest 200 tasks are kept, and a broken line is skipped", (t) => {
  const home = tempDir(t);
  for (let i = 0; i < 205; i++) recordTask(home, { cwd: home, task: `task ${i}` });
  fs.appendFileSync(path.join(home, ...TASK_LOG), "not json\n");
  const lines = fs.readFileSync(path.join(home, ...TASK_LOG), "utf8").trim().split("\n");
  assert.equal(lines.length, 201);
  assert.deepEqual(recentTasks(home, home, 2).map((r) => r.task), ["task 204", "task 203"]);
});

test("a home that cannot be written does not stop the answer", (t) => {
  const home = tempDir(t);
  fs.writeFileSync(path.join(home, ".which-ai-to-use"), "a file where the folder should be");
  assert.doesNotThrow(() => recordTask(home, { cwd: home, task: "add a coupon field" }));
  assert.deepEqual(recentTasks(home, home), []);
});

test("recent lists the project's tasks with the AI suggested, or says there are none", (t) => {
  const home = tempDir(t);
  assert.equal(recentAction({ cwd: home, home }).text, "No tasks asked in this project yet.\n");
  recordTask(home, { cwd: home, task: "add a coupon field", best: "Claude Code" });
  assert.match(recentAction({ cwd: home, home }).text, /^Recent tasks in .+:\n {2}1\. add a coupon field {2}→ Claude Code\n\nAsk one again: npx which-ai-to-use "<task>"\n$/);
});

test("the dashboard keeps each task it answers and lists them under recent", async (t) => {
  const home = tempDir(t);
  const detect = () => [{ id: "claude-code", name: "Claude Code", onPath: true, via: ["command: claude"] }];
  await runAction("task", { task: "fix the login bug" }, { cwd: home, home, detect });
  const { data } = await runAction("recent", {}, { cwd: home, home, detect });
  assert.deepEqual(data.tasks.map((r) => [r.task, r.best]), [["fix the login bug", "Claude Code"]]);
});
