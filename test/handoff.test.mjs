import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectHandoff, handoffMeta, handoffTask, renderHandoff, webHandoff } from "../src/handoff.mjs";
import { handoffAction, nextChoices, webNote } from "../src/actions.mjs";

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

test("without git, the files the AI changed in its chat stand in for the changes", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-handoff-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "index.html"), "<h1>hi</h1>\n");
  const info = collectHandoff(dir, { edited: ["HANDOFF.md", "index.html", "old.css"] });
  assert.equal(info.git, false);
  assert.equal(info.root, path.resolve(dir));
  assert.deepEqual(info.changes, [
    { status: "edited", file: "index.html", added: null, removed: null },
    { status: "deleted", file: "old.css", added: null, removed: null },
  ]);
  const chat = { tool: "claude-code", name: "Claude Code", task: "make my portfolio", recent: [], lastReply: "The hero is done.", requests: 1 };
  const note = renderHandoff({ task: "", info, verify: null, date: "2026-10-23", chat });
  assert.doesNotMatch(note, /Branch:|Commits for this task|Uncommitted changes/);
  assert.match(note, /## Files changed in the chat\n\n- edited `index\.html`\n- deleted `old\.css`\n/);
  assert.match(note, /This folder has no git, so there are no commits or diffs to read\./);
  assert.match(note, /Do not redo work that is already done\./);
  assert.match(renderHandoff({ task: "x", info: { ...info, changes: [] }, verify: null, date: "2026-10-23" }), /Unknown: this folder has no git and no AI chat was found for it\./);
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

test("every installed AI that runs in a terminal is a choice, however many editor tools are installed too", (t) => {
  const dir = repo(t);
  const cli = (id, bin) => ({ id, onPath: true, via: [`command: ${bin}`] });
  const editor = (id) => ({ id, onPath: true, via: ["extension: vscode"] });
  const installed = [editor("github-copilot"), editor("cursor"), editor("cline"), editor("windsurf"), cli("codex", "codex"), cli("gemini-cli", "gemini"), cli("aider", "aider"), cli("claude-code", "claude")];
  const ids = nextChoices({ cwd: dir, home: dir, installed, leftOut: [], task: "fix the login bug" }).filter((c) => c.installed).map((c) => c.id);
  assert.deepEqual(ids.sort(), ["aider", "claude-code", "codex", "gemini-cli"]);
});

test("a note written by the Claude Code plugin says so, and the task can be read back", (t) => {
  const dir = repo(t);
  const { note } = handoffAction({ cwd: dir, home: dir, task: "add coupons", installed: [], leftOut: ["claude-code"], by: "hook" }).data;
  assert.deepEqual(handoffMeta(note), { from: "claude-code", by: "hook", resets: null });
  assert.equal(handoffTask(note), "add coupons");
  assert.equal(handoffTask("# Handoff\n\nTask: not given (ask the user)\n"), "");
  assert.equal(handoffMeta("<!-- which-ai-to-use: from=claude-code resets=2026-10-22T10:00:00.000Z -->").by, null);
});

test("for a chat on the web the note carries the changes: branch commits, edits and new files, never private files or keys", (t) => {
  const dir = repo(t);
  git(dir, "checkout", "-q", "-b", "feature/coupons");
  fs.writeFileSync(path.join(dir, "src", "cart.js"), "export const total = () => 1;\n");
  git(dir, "commit", "-qam", "Count the cart");
  // A made-up key, put together here so the source holds nothing that looks like a real one.
  const key = ["sk", "live", "abcdefghijklmnopqrstuvwx"].join("_");
  fs.writeFileSync(path.join(dir, "src", "cart.js"), `export const total = () => 2;\nconst key = "${key}";\n`);
  fs.writeFileSync(path.join(dir, "src", "coupon.js"), "export const code = 'SAVE10';\n");
  fs.writeFileSync(path.join(dir, ".env"), "STRIPE_KEY=secret\n");
  fs.writeFileSync(path.join(dir, "HANDOFF.md"), "# Handoff\n");
  const web = webNote(dir, "# Handoff\n\nTask: add coupons\n");
  assert.match(web, /^# Handoff\n\nTask: add coupons\n\n## The changes \(you cannot open the project, so here they are\)\n\n```diff\n/);
  assert.match(web, /-export const total = \(\) => 0;/, "the commit on the branch is in the diff");
  assert.match(web, /\+export const total = \(\) => 2;/, "the uncommitted change is in the diff");
  assert.match(web, /New file `src\/coupon\.js`:\n\n```\nexport const code = 'SAVE10';\n```/);
  assert.doesNotMatch(web, /STRIPE_KEY|\.env/);
  assert.ok(!web.includes(key), "the key is hidden");
  assert.doesNotMatch(web, /New file `HANDOFF\.md`/);
});

test("for a chat on the web, a folder without git gets the files changed in the chat, and a long one is cut cleanly", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-web-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "index.html"), "<h1>hi</h1>\n");
  fs.writeFileSync(path.join(dir, ".env"), "KEY=1\n");
  const note = "# Handoff\n\n## Files changed in the chat\n\n- edited `index.html`\n- edited `.env`\n- deleted `old.css`\n";
  const web = webHandoff(dir, note, (text) => text);
  assert.match(web, /`index\.html`:\n\n```\n<h1>hi<\/h1>\n```/);
  assert.doesNotMatch(web, /KEY=1|old\.css`:/);
  assert.equal(webHandoff(dir, "# Handoff\n", (text) => text), "# Handoff\n", "nothing to add: the note as it is");
  fs.writeFileSync(path.join(dir, "README.md"), "Run:\n\n```\nnpm start\n```\n");
  const readme = webHandoff(dir, "# Handoff\n\n- edited `README.md`\n", (text) => text);
  assert.match(readme, /`README\.md`:\n\n````\nRun:\n\n```\nnpm start\n```\n````/, "a file with its own code block gets a longer fence");
  for (let i = 0; i < 8; i++) fs.writeFileSync(path.join(dir, `part${i}.js`), "x".repeat(11_000));
  const long = webHandoff(dir, `# Handoff\n\n${Array.from({ length: 8 }, (_, i) => `- edited \`part${i}.js\``).join("\n")}\n`, (text) => text);
  assert.match(long, /… \(cut here to keep this short: ask me for any file you need\)\n$/);
  assert.equal((long.match(/^```/gm) ?? []).length % 2, 0, "every code block is closed");
});

test("the handoff answer carries the note for the web, and the web choice says the changes are copied", (t) => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, "src", "cart.js"), "export const total = () => 3;\n");
  const result = handoffAction({ cwd: dir, task: "add coupons", installed: [], date: "2026-10-23" });
  assert.match(result.data.web, /\+export const total = \(\) => 3;/);
  assert.equal(result.data.choices.find((c) => c.id === "web").why, "HANDOFF.md and the changes are copied to your clipboard; paste them into the chat");
});

test("on main, the latest commits are called recent commits, not commits for this task", (t) => {
  const dir = repo(t);
  const { text, data } = handoffAction({ cwd: dir, home: dir, task: "add coupons", installed: [] });
  assert.match(data.note, /## Recent commits on main \(not all may be for this task\)\n\n- Add cart/);
  assert.doesNotMatch(data.note, /Commits for this task/);
  assert.match(text, /Wrote HANDOFF\.md: 0 changed file\(s\), 1 recent commit\(s\) on main\./);
});
