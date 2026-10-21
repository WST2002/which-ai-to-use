import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectHandoff, renderHandoff } from "../src/handoff.mjs";

const git = (dir, ...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });

function repo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-handoff-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "user.email", "test@example.com");
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src", "cart.js"), "export const total = () => 0;\n");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "Add cart");
  return dir;
}

test("an earlier HANDOFF.md is not listed as a change", (t) => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, "src", "cart.js"), "export const total = () => 1;\n");
  fs.writeFileSync(path.join(dir, "HANDOFF.md"), "# Handoff\n");
  assert.deepEqual(collectHandoff(dir).changes.map((c) => c.file), ["src/cart.js"]);
});

test("collects the branch, changed files with line counts, and commits on the branch", (t) => {
  const dir = repo(t);
  git(dir, "checkout", "-q", "-b", "feat/discounts");
  fs.writeFileSync(path.join(dir, "src", "cart.js"), "export const total = (items) => items.length;\nexport const discount = 0;\n");
  git(dir, "commit", "-q", "-am", "Count items in total");
  fs.writeFileSync(path.join(dir, "src", "cart.js"), "export const total = (items) => items.length;\nexport const discount = 10;\n");
  fs.writeFileSync(path.join(dir, "src", "coupon.js"), "export const code = 'X';\n");

  const info = collectHandoff(dir);
  assert.equal(info.branch, "feat/discounts");
  assert.deepEqual(info.commits, ["Count items in total"]);
  assert.deepEqual(info.changes, [
    { status: "modified", file: "src/cart.js", added: 1, removed: 1 },
    { status: "new", file: "src/coupon.js", added: 1, removed: 0 },
  ]);
});

test("outside a git repository it explains what is needed", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-handoff-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.throws(() => collectHandoff(dir), /handoff needs a git repository/);
});

test("the handoff note tells the next AI what was done and what to do first", () => {
  const note = renderHandoff({
    task: "add coupon codes to the cart",
    info: { branch: "feat/discounts", commits: ["Count items in total"], changes: [{ status: "modified", file: "src/cart.js", added: 1, removed: 1 }] },
    verify: "npm test",
    date: "2026-10-24",
  });
  assert.match(note, /^# Handoff/m);
  assert.match(note, /Task: add coupon codes to the cart/);
  assert.match(note, /Branch: feat\/discounts/);
  assert.match(note, /- modified `src\/cart\.js` \(\+1 −1\)/);
  assert.match(note, /- Count items in total/);
  assert.match(note, /Run `npm test`/);
  assert.match(note, /Do not redo work that is already committed/);
});

test("without a task or tests the note still reads well", () => {
  const note = renderHandoff({ task: "", info: { branch: "main", commits: [], changes: [] }, verify: null, date: "2026-10-24" });
  assert.match(note, /Task: not given/);
  assert.match(note, /No uncommitted changes/);
  assert.doesNotMatch(note, /Run `/);
});
