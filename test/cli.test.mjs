import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { handoffMeta } from "../src/handoff.mjs";

const cli = path.resolve(import.meta.dirname, "../bin/cli.mjs");

// The folder holding git, for commands that need it while every other tool stays hidden.
const gitDir = () =>
  (process.env.PATH ?? "").split(path.delimiter).find((dir) => ["git", "git.exe"].some((name) => fs.existsSync(path.join(dir, name))));

function machine(t, { bins = [], files = {}, withGit = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-cli-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  for (const dir of [bin, home, project]) fs.mkdirSync(dir, { recursive: true });
  for (const name of bins) {
    const file = path.join(bin, process.platform === "win32" ? `${name}.cmd` : name);
    fs.writeFileSync(file, "");
    fs.chmodSync(file, 0o755);
  }
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(project, name)), { recursive: true });
    fs.writeFileSync(path.join(project, name), content);
  }
  const run = (...args) =>
    spawnSync(process.execPath, [cli, ...args], {
      cwd: project,
      env: { ...process.env, PATH: withGit ? [bin, gitDir()].join(path.delimiter) : bin, HOME: home, USERPROFILE: home },
      encoding: "utf8",
      input: "",
    });
  return { project, run };
}

test("--help prints help", (t) => {
  const result = machine(t).run("--help");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Start here:/);
  assert.match(result.stdout, /which-ai-to-use fix/);
  assert.match(result.stdout, /doctor/);
});

test("no arguments gives a plain-language checkup of this project", (t) => {
  const { run } = machine(t, {
    bins: ["claude"],
    files: { "CLAUDE.md": `# Rules\n${"word ".repeat(3000)}\n`, "package-lock.json": "x".repeat(40 * 1024), "src/app.js": "x" },
  });
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Your AI tools: Claude Code/);
  assert.match(result.stdout, /2 things are wasting your tokens/);
  assert.match(result.stdout, /1\. CLAUDE\.md \(your instructions file\) is ~3,\d{3} tokens/);
  assert.match(result.stdout, /2\. package-lock\.json is ~10,240 tokens/);
  assert.match(result.stdout, /npx which-ai-to-use fix/);
  assert.match(result.stdout, /Starting a task\?\s+npx which-ai-to-use "your task"/);
  assert.match(result.stdout, /Claude limit over\?\s+npx which-ai-to-use handoff/);
  assert.doesNotMatch(result.stdout, /MCP|rules file/i);
});

test("a task typed without quotes that starts with a command word is a task, not the command", (t) => {
  const { run } = machine(t, { bins: ["claude"], files: { "package-lock.json": "x".repeat(40 * 1024), "src/app.js": "x" } });
  const fixTask = run("fix", "the", "login", "bug");
  assert.equal(fixTask.status, 0, fixTask.stderr);
  assert.match(fixTask.stdout, /Task: fix the login bug/);
  assert.doesNotMatch(fixTask.stdout, /will skip these files|Nothing to fix/);
  assert.match(run("report", "the", "checkout", "crash").stdout, /Task: report the checkout crash/);
  assert.match(run("fix").stdout, /will skip these files/);
});

test("Gemini CLI on a personal Google login is named with what to do, in the checkup, doctor and a task", (t) => {
  const m = machine(t, { bins: ["claude", "gemini"], files: { "src/app.js": "x" } });
  const home = path.join(m.project, "..", "home");
  fs.mkdirSync(path.join(home, ".gemini"), { recursive: true });
  fs.writeFileSync(path.join(home, ".gemini", "settings.json"), JSON.stringify({ security: { auth: { selectedType: "oauth-personal" } } }));
  const why = /⚠ Gemini CLI signs in with a personal Google account, which Google stopped serving on 18 June 2026\. Use Antigravity CLI \(free tier\) instead/;
  const checkup = m.run();
  assert.match(checkup.stdout, /Your AI tools: Claude Code\n/);
  assert.match(checkup.stdout, why);
  assert.match(m.run("doctor").stdout, why);
  const task = m.run("fix the login bug");
  assert.match(task.stdout, why);
  assert.doesNotMatch(task.stdout, /Run:\s+gemini/);
});

test("a clean project checkup says nothing is wasted", (t) => {
  const result = machine(t, { bins: ["claude"], files: { "src/app.js": "x" } }).run();
  assert.match(result.stdout, /Nothing is wasting your tokens here/);
});

test("recommends from the tools on this machine", (t) => {
  const result = machine(t, { bins: ["claude", "agy"] }).run("add", "two-factor", "login");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Best of these: Claude Code/);
  assert.match(result.stdout, /claude "add two-factor login"/);
  assert.match(result.stdout, /Antigravity CLI \(installed, free tier\)/);
});

test("--json prints machine-readable output", (t) => {
  const result = machine(t, { bins: ["claude"] }).run("fix the login bug", "--json");
  const data = JSON.parse(result.stdout);
  assert.equal(data.best.id, "claude-code");
  assert.ok(data.categories.includes("bug-fix"));
});

test("sensitive files trigger privacy ranking", (t) => {
  const result = machine(t, { bins: ["claude", "ollama"], files: { ".env": "KEY=1" } }).run("add login", "--json");
  assert.equal(JSON.parse(result.stdout).best.id, "ollama");
});

test("doctor lists every supported tool and this project's rules files", (t) => {
  const result = machine(t, { bins: ["codex"], files: { "AGENTS.md": "rules" } }).run("doctor");
  assert.equal(result.status, 0);
  assert.match(result.stdout, /✓ Codex CLI/);
  assert.match(result.stdout, /✗ Gemini CLI/);
  assert.match(result.stdout, /✓ AGENTS\.md/);
});

test("sync writes rules for installed tools", (t) => {
  const m = machine(t, { bins: ["claude", "gemini"], files: { "AGENTS.md": "- Run tests.\n" } });
  const result = m.run("sync", "--yes");
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.readFileSync(path.join(m.project, "CLAUDE.md"), "utf8").endsWith("- Run tests.\n"));
  assert.ok(fs.existsSync(path.join(m.project, "GEMINI.md")));
  assert.equal(fs.existsSync(path.join(m.project, ".windsurfrules")), false);
});

test("sync without a rules file explains how to fix it", (t) => {
  const result = machine(t, { bins: ["claude"] }).run("sync");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No rules file found\. Create AGENTS\.md/);
});

test("invalid --prefer value is rejected with the allowed values", (t) => {
  const result = machine(t, { bins: ["claude"] }).run("add login", "--prefer", "cheap");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--prefer must be one of: balanced, free, quality/);
});

test("an empty task is rejected with a fix", (t) => {
  const result = machine(t, { bins: ["claude"] }).run("  ");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /task is empty/i);
  assert.match(result.stderr, /which-ai-to-use "/);
});

test("tokens reports rules size, heavy files with ignore advice, and MCP servers", (t) => {
  const { run } = machine(t, {
    bins: ["claude"],
    files: { "CLAUDE.md": `# Rules\n${"word ".repeat(3000)}\n`, "package-lock.json": "x".repeat(40 * 1024), "src/app.js": "x" },
  });
  const result = run("tokens");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /CLAUDE\.md\s+~3,\d{3} tokens/);
  assert.match(result.stdout, /over 2,000/);
  assert.match(result.stdout, /package-lock\.json\s+~10,240 tokens/);
  assert.match(result.stdout, /\.claude\/settings\.json/);
  assert.match(result.stdout, /Read\(\.\/package-lock\.json\)/);
  assert.match(result.stdout, /Add-ons \(MCP servers\): none found/);
  assert.match(result.stdout, /Instructions files \(sent with every message\)/);
});

test("tokens --json is machine-readable", (t) => {
  const result = machine(t, { files: { "AGENTS.md": "Use npm test.\n" } }).run("tokens", "--json");
  const data = JSON.parse(result.stdout);
  assert.equal(data.rules[0].file, "AGENTS.md");
  assert.deepEqual(data.heavy, []);
  assert.deepEqual(data.mcp, []);
});

test("the run command carries relevant files and the project's test command", (t) => {
  const { run } = machine(t, {
    bins: ["claude"],
    files: { "src/auth/login.ts": "x", "src/cart.ts": "x", "package.json": JSON.stringify({ scripts: { test: "vitest run" } }) },
  });
  const result = run("fix the login redirect bug");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Files:\s+src\/auth\/login\.ts/);
  assert.match(result.stdout, /claude "fix the login redirect bug\. Start with src\/auth\/login\.ts\. When done, run npm test and report the result\."/);
});

test("--without skips a tool, for example when its usage limit is reached", (t) => {
  const result = machine(t, { bins: ["claude", "gemini"] }).run("add a dashboard", "--without", "claude-code", "--json");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).best.id, "gemini-cli");
});

test("--without rejects unknown tools with the valid ids", (t) => {
  const result = machine(t, { bins: ["claude"] }).run("add a dashboard", "--without", "chatgpt");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unknown tool "chatgpt".*claude-code/);
});

test("handoff writes HANDOFF.md and gives the next tool a command to continue", (t) => {
  const { project, run } = machine(t, { bins: ["claude", "gemini"], files: { "src/cart.js": "a\n" }, withGit: true });
  for (const args of [["init", "-q", "-b", "main"], ["config", "user.name", "T"], ["config", "user.email", "t@example.com"], ["add", "-A"], ["commit", "-q", "-m", "Start"]]) {
    spawnSync("git", args, { cwd: project });
  }
  fs.writeFileSync(path.join(project, "src", "cart.js"), "a\nb\n");
  const result = run("handoff", "add coupons", "--without", "claude-code");
  assert.equal(result.status, 0, result.stderr);
  const note = fs.readFileSync(path.join(project, "HANDOFF.md"), "utf8");
  assert.match(note, /Task: add coupons/);
  assert.match(note, /modified `src\/cart\.js` \(\+1 −0\)/);
  assert.match(result.stdout, /Wrote HANDOFF\.md/);
  assert.match(result.stdout, /Next:\s+Gemini CLI/);
  assert.match(result.stdout, /gemini -i "Read HANDOFF\.md and continue the task\."/);
});

function gitProject(t, bins) {
  const { project, run } = machine(t, { bins, files: { "src/cart.js": "a\n" }, withGit: true });
  for (const args of [["init", "-q", "-b", "main"], ["config", "user.name", "T"], ["config", "user.email", "t@example.com"], ["add", "-A"], ["commit", "-q", "-m", "Start"]]) {
    spawnSync("git", args, { cwd: project });
  }
  return { project, run };
}

test("handoff leaves out Claude Code by default, since its limit is what ran out", (t) => {
  const result = gitProject(t, ["claude", "gemini"]).run("handoff", "add coupons");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Left out: Claude Code \(limit over\)\. Handing off from another AI\? Add --without <tool>\./);
  assert.match(result.stdout, /Next:\s+Gemini CLI/);
  assert.doesNotMatch(result.stdout, /Run:\s+claude /);
});

test("handoff from another AI keeps Claude Code as the next one", (t) => {
  const result = gitProject(t, ["claude", "gemini"]).run("handoff", "add coupons", "--without", "gemini-cli");
  assert.match(result.stdout, /Next:\s+Claude Code/);
  assert.doesNotMatch(result.stdout, /Left out:/);
});

test("handoff with only Claude Code installed explains how to carry on anyway", (t) => {
  const { project, run } = gitProject(t, ["claude"]);
  const result = run("handoff", "add coupons");
  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(project, "HANDOFF.md")));
  assert.doesNotMatch(result.stdout, /No AI coding tools found/);
  assert.match(result.stdout, /No other AI tool is installed\. To carry on:/);
  assert.match(result.stdout, /Paste HANDOFF\.md into ChatGPT \(chatgpt\.com\) or Gemini \(gemini\.google\.com\)/);
  assert.match(result.stdout, /install Antigravity CLI \(free tier\): .*antigravity\.google\/cli\/install.*, then run: agy -i "Read HANDOFF\.md and continue the task\."/);
  assert.match(result.stdout, /Add --copy to put HANDOFF\.md on your clipboard\./);
});

test("handoff --copy puts the note on the clipboard, or says how to copy it by hand", (t) => {
  const result = gitProject(t, ["claude"]).run("handoff", "add coupons", "--copy");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Copied HANDOFF\.md to your clipboard: paste it into any AI chat\.|Could not reach the clipboard \(no clipboard tool found\): open HANDOFF\.md and copy it\./);
  assert.doesNotMatch(result.stdout, /Add --copy/);
});

test("handoff in a folder without git lists the files the AI changed in its chat", (t) => {
  const { project, run } = machine(t, { bins: ["claude", "gemini"], files: { "index.html": "<h1>hi</h1>\n" } });
  const log = path.join(project, "..", "home", ".claude", "projects", "p", "s.jsonl");
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.writeFileSync(log, [
    { type: "user", cwd: project, message: { role: "user", content: "make my portfolio" } },
    { type: "assistant", cwd: project, message: { role: "assistant", content: [{ type: "tool_use", name: "Write", input: { file_path: path.join(project, "index.html") } }, { type: "text", text: "The hero is done." }] } },
  ].map((line) => JSON.stringify(line)).join("\n") + "\n");
  const result = run("handoff", "--to", "none");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Wrote HANDOFF\.md: 1 file\(s\) changed in the Claude Code chat \(this folder has no git\)\./);
  const note = fs.readFileSync(path.join(project, "HANDOFF.md"), "utf8");
  assert.match(note, /Task: make my portfolio/);
  assert.match(note, /- edited `index\.html`/);
});

test("handoff in a folder without git or any chat still writes the note and asks for the task", (t) => {
  const { project, run } = machine(t, { bins: ["claude"] });
  const result = run("handoff", "--to", "none");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /This folder has no git and no AI chat was found for it, so say what you were doing: npx which-ai-to-use handoff "<task>"/);
  assert.ok(fs.existsSync(path.join(project, "HANDOFF.md")));
});

test("fix shows what it would change and needs a yes before writing", (t) => {
  const { project, run } = machine(t, { bins: ["claude"], files: { "package-lock.json": "x".repeat(40 * 1024) } });
  const preview = run("fix");
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /package-lock\.json → \.claude\/settings\.json \(Claude Code\)/);
  assert.match(preview.stdout, /--yes/);
  assert.equal(fs.existsSync(path.join(project, ".claude", "settings.json")), false);

  const applied = run("fix", "--yes");
  assert.match(applied.stdout, /Updated \.claude\/settings\.json\./);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project, ".claude", "settings.json"), "utf8")).permissions.deny, ["Read(./package-lock.json)"]);
  assert.match(run("fix", "--yes").stdout, /Nothing to fix/);
});

test("doctor is honest when sensitive files exist but no AI tool runs locally", (t) => {
  const result = machine(t, { bins: ["claude"], files: { ".env": "KEY=1" } }).run("doctor");
  assert.match(result.stdout, /Sensitive files: \.env/);
  assert.match(result.stdout, /none of your AI tools run on this laptop/);
  assert.doesNotMatch(result.stdout, /local tools will be preferred/);
});

test("dashboard prints a local link and serves the page", async (t) => {
  const { project } = machine(t, { bins: ["claude"] });
  const child = spawn(process.execPath, [cli, "dashboard", "--no-open"], { cwd: project, env: { ...process.env, PATH: "", HOME: project, USERPROFILE: project } });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  try {
    const link = await new Promise((resolve, reject) => {
      let out = "";
      child.stdout.on("data", (chunk) => {
        out += chunk;
        const match = /http:\/\/127\.0\.0\.1:\d+\/\?t=[a-f0-9]+/.exec(out);
        if (match) resolve(match[0]);
      });
      exited.then(() => reject(new Error(`dashboard exited: ${out}`)));
    });
    const page = await fetch(link);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Which AI for a task\?/);
  } finally {
    // Stop the server before the temp folder is removed: Windows cannot delete a folder a process is using.
    child.kill();
    await exited;
  }
});

test("the recommendation explains each choice in plain words", (t) => {
  const result = machine(t, { bins: ["claude"] }).run("make the hero section look better");
  assert.match(result.stdout, /→\s+design \(UI\)/);
  assert.match(result.stdout, /Best of these: Claude Code ★ \(installed\)\n\s+Can change several components and run your dev server/);
});

test("the answer first names the best AI anywhere, then the best one on this laptop", (t) => {
  const result = machine(t, { bins: ["claude"] }).run("make the hero section look better");
  assert.match(result.stdout, /① Best AI for this task \(any tool\)\n\s+Cursor: shows each design change right in the editor as you go\.\n\s+✗ Not on your laptop · get it: cursor\.com/);
  assert.match(result.stdout, /② On your laptop: Claude Code\n\s+Best of these: Claude Code ★/);
  assert.match(result.stdout, /Run:\s+claude "make the hero section look better/);

  const bug = machine(t, { bins: ["claude"] }).run("fix the crash in checkout");
  assert.match(bug.stdout, /① Best AI for this task \(any tool\)\n\s+Claude Code: .+\n\s+✓ It's on your laptop, use it\./);
  assert.doesNotMatch(bug.stdout, /② On your laptop/, "one tool that is also the best anywhere is not repeated");
  const two = machine(t, { bins: ["claude", "gemini"] }).run("fix the crash in checkout");
  assert.match(two.stdout, /② On your laptop: Claude Code, Gemini CLI/);
});

test("the answer estimates the tokens it takes to start", (t) => {
  const result = machine(t, { bins: ["claude"], files: { "CLAUDE.md": "x".repeat(4000), "src/hero.tsx": "x".repeat(2000) } }).run("make the hero look better");
  assert.match(result.stdout, /Start:\s+~1,5\d\d tokens before any work \(CLAUDE\.md ~1,000 · files ~500 · prompt ~\d+\); the work itself uses more/);
});

test("usage shows Claude Code tokens from local logs, numbers only", (t) => {
  const { project, run } = machine(t, { bins: ["claude", "agy"] });
  const home = path.join(project, "..", "home");
  const now = new Date();
  const lines = [0, 1, 2].map((i) =>
    JSON.stringify({ type: "assistant", timestamp: now.toISOString(), cwd: "/home/dev/work/shop", message: { id: `m${i}`, content: [{ type: "text", text: "SECRET-TEXT" }], usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 9000 } } }),
  );
  fs.mkdirSync(path.join(home, ".claude", "projects", "shop"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "projects", "shop", "s.jsonl"), lines.join("\n"));
  const result = run("usage");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Today:\s+~4,500 tokens in 3 replies \(\+ ~27,000 re-read from cache\)/);
  assert.match(result.stdout, /5-hour limit window \(estimate\)\n\s+~4,500 tokens in 3 replies since \d\d:\d\d · resets about \d\d:\d\d \(in (\d h )?\d+ min\)/);
  assert.match(result.stdout, /Busiest projects \(7 days\): shop ~4,500/);
  assert.match(result.stdout, /Tip: Today is 7\.0× your daily average\. Send small tasks to Antigravity CLI \(free\)/);
  assert.doesNotMatch(result.stdout, /SECRET-TEXT/);
});

test("score explains the points and gives a line to share; checkup shows the score", (t) => {
  const { run } = machine(t, { bins: ["claude"], files: { "package-lock.json": "x".repeat(40 * 1024), "src/app.js": "x" } });
  const score = run("score");
  assert.equal(score.status, 0, score.stderr);
  assert.match(score.stdout, /AI setup score: 77\/100 \(B\)/);
  assert.match(score.stdout, /−10  No instructions file/);
  assert.match(score.stdout, /−3  1 heavy file \(~10,240 tokens\) your AI can read\n\s+→ Make your AI skip it: npx which-ai-to-use fix/);
  assert.match(score.stdout, /My AI coding setup scored 77\/100 \(B\) with which-ai-to-use\. Fixing it saves ~10,240 tokens\./);
  assert.match(run().stdout, /AI setup score: 77\/100 \(B\)/);
});

test("score --card opens the dashboard straight on the score card", async (t) => {
  const { project } = machine(t, { bins: ["claude"] });
  const child = spawn(process.execPath, [cli, "score", "--card", "--no-open"], { cwd: project, env: { ...process.env, PATH: "", HOME: project, USERPROFILE: project } });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  try {
    const link = await new Promise((resolve, reject) => {
      let out = "";
      child.stdout.on("data", (chunk) => {
        out += chunk;
        const match = /http:\/\/127\.0\.0\.1:\d+\/\?t=[a-f0-9]+&view=score/.exec(out);
        if (match) resolve(match[0]);
      });
      exited.then(() => reject(new Error(`score --card exited: ${out}`)));
    });
    assert.equal((await fetch(link)).status, 200);
  } finally {
    child.kill();
    await exited;
  }
});

test("handoff with no task reads the Claude Code chat for this project", (t) => {
  const { project, run } = gitProject(t, ["claude", "gemini"]);
  const home = path.join(project, "..", "home");
  const line = (type, text) => JSON.stringify({ type, cwd: project, message: { role: type, content: text } });
  fs.mkdirSync(path.join(home, ".claude", "projects", "shop"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "projects", "shop", "s.jsonl"), [
    line("user", "Add a pricing section to the landing page, api_key=abc123secret"),
    line("assistant", [{ type: "text", text: "Pricing cards are done; the FAQ is still empty." }]),
  ].join("\n"));
  const result = run("handoff");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Read the Claude Code chat: "Add a pricing section to the landing page, api_key=\[hidden\]" \(1 request\)\./);
  const note = fs.readFileSync(path.join(project, "HANDOFF.md"), "utf8");
  assert.match(note, /^Task: Add a pricing section to the landing page/m);
  assert.match(note, /Where Claude stopped: "Pricing cards are done; the FAQ is still empty\."/);
  assert.doesNotMatch(note, /abc123secret/);
});

test("handing off from Codex reads the Codex chat", (t) => {
  const { project, run } = gitProject(t, ["claude", "codex"]);
  const home = path.join(project, "..", "home");
  const file = path.join(home, ".codex", "sessions", "2026", "10", "22", "rollout-1.jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const line = (type, payload) => JSON.stringify({ timestamp: "2026-10-22T08:00:00.000Z", type, payload });
  fs.writeFileSync(file, [
    line("session_meta", { id: "s1", cwd: project }),
    line("response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "Add a coupon field to checkout" }] }),
    line("response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: "The field is in; validation is next." }] }),
  ].join("\n"));
  const result = run("handoff", "--without", "codex", "--to", "none");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Read the Codex CLI chat: "Add a coupon field to checkout" \(1 request\)\./);
  const note = fs.readFileSync(path.join(project, "HANDOFF.md"), "utf8");
  assert.match(note, /## From the Codex CLI chat/);
  assert.match(note, /Where Codex CLI stopped: "The field is in; validation is next\."/);
});

// Replaces a stand-in command with one that logs how it was started.
function loggingStandIn(project, name) {
  const bin = path.join(project, "..", "bin");
  const log = path.join(project, "..", `${name}.log`);
  if (process.platform === "win32") fs.writeFileSync(path.join(bin, `${name}.cmd`), `@echo off\r\necho %*>>"${log}"\r\n`);
  else {
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\necho "$@" >> "${log}"\n`);
    fs.chmodSync(path.join(bin, name), 0o755);
  }
  return log;
}

test("handoff --to starts the chosen AI with the note", (t) => {
  const { project, run } = gitProject(t, ["claude", "gemini"]);
  const log = loggingStandIn(project, "gemini");
  const result = run("handoff", "add coupons", "--to", "gemini-cli");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Starting Gemini CLI: gemini -i "Read HANDOFF\.md and continue the task\."/);
  assert.doesNotMatch(result.stdout, /^Next:/m);
  assert.match(fs.readFileSync(log, "utf8"), /-i "?Read HANDOFF\.md and continue the task\."?/);
});

test("handoff --to none only writes the note; an unknown choice lists the valid ones", (t) => {
  const { project, run } = gitProject(t, ["claude", "gemini"]);
  const none = run("handoff", "add coupons", "--to", "none");
  assert.match(none.stdout, /HANDOFF\.md is ready\./);
  assert.ok(fs.existsSync(path.join(project, "HANDOFF.md")));
  const bad = run("handoff", "add coupons", "--to", "chatgpt");
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--to must be one of: gemini-cli, antigravity-cli, web, other, none, claude-code, codex, aider/);
});

test("handoff to an AI that is not installed shows how to install it, and installs it only with a yes", (t) => {
  const { project, run } = gitProject(t, ["claude", "gemini"]);
  const npmLog = loggingStandIn(project, "npm");
  const ask = run("handoff", "add coupons", "--to", "codex");
  assert.equal(ask.status, 0, ask.stderr);
  assert.match(ask.stdout, /Install Codex CLI with: npm install -g @openai\/codex\nThen run: codex /);
  assert.ok(!fs.existsSync(npmLog), "nothing installed without a yes");
  const yes = run("handoff", "add coupons", "--to", "codex", "--yes");
  assert.match(fs.readFileSync(npmLog, "utf8"), /install -g @openai\/codex/);
  assert.match(yes.stdout, /Starting Codex CLI: codex /);
});

test("handoff to another AI says what to tell it", (t) => {
  const result = gitProject(t, ["claude", "gemini"]).run("handoff", "add coupons", "--to", "other");
  assert.match(result.stdout, /Start your AI in this folder and tell it: "Read HANDOFF\.md and continue the task\."/);
});

test("handing off from Claude notes when its limit resets, and --back hands the task back", (t) => {
  const { project, run } = gitProject(t, ["claude", "gemini"]);
  const home = path.join(project, "..", "home");
  fs.mkdirSync(path.join(home, ".claude", "projects", "p"), { recursive: true });
  const at = new Date(Date.now() - 30 * 60000).toISOString();
  fs.writeFileSync(path.join(home, ".claude", "projects", "p", "s.jsonl"), JSON.stringify({ type: "assistant", timestamp: at, cwd: project, message: { id: "m1", usage: { input_tokens: 10, output_tokens: 5 } } }));
  const away = run("handoff", "add coupons", "--to", "none");
  assert.match(away.stdout, /Claude's limit resets about \d\d:\d\d \(in (\d h )?\d+ min\)\. Then hand the task back: npx which-ai-to-use handoff --back/);
  const meta = handoffMeta(fs.readFileSync(path.join(project, "HANDOFF.md"), "utf8"));
  assert.equal(meta.from, "claude-code");
  assert.ok(meta.resets > Date.now());
  const log = loggingStandIn(project, "claude");
  const back = run("handoff", "--back");
  assert.equal(back.status, 0, back.stderr);
  assert.match(back.stdout, /Starting Claude Code: claude /);
  assert.doesNotMatch(back.stdout, /Left out:/);
  assert.match(fs.readFileSync(log, "utf8"), /Read HANDOFF\.md and continue the task\./);
});

test("--back with --to none writes the note for Claude but starts nothing", (t) => {
  const { project, run } = gitProject(t, ["claude", "gemini"]);
  const log = loggingStandIn(project, "claude");
  const result = run("handoff", "--back", "--to", "none");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /HANDOFF\.md is ready\./);
  assert.doesNotMatch(result.stdout, /Starting Claude Code/);
  assert.equal(fs.existsSync(log), false, "Claude Code was not started");
});

test("a task with every installed AI left out says they are left out, not missing", (t) => {
  const result = gitProject(t, ["claude", "gemini"]).run("add a coupon field", "--without", "claude-code", "--without", "gemini-cli");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /All your AI tools are left out \(Claude Code, Gemini CLI\)\. Wait for a limit to reset, or try a free one: Antigravity CLI \(free tier\) or Ollama/);
  assert.doesNotMatch(result.stdout, /No AI coding tools found/);
});

test("--back without Claude Code says so", (t) => {
  const result = gitProject(t, ["gemini"]).run("handoff", "--back");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--back needs Claude Code on this laptop, and it was not found/);
});

test("with no AI installed, a task gets the AI to install, a free one and the website", (t) => {
  const result = machine(t).run("build a landing page");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^No AI coding tool was found on this laptop\. For "build a landing page"/);
  assert.match(result.stdout, /1\. Best for this task: Claude Code, .+\n\s+Install: npm install -g @anthropic-ai\/claude-code\n\s+Then:\s+claude "build a landing page/);
  assert.match(result.stdout, /Free option: Antigravity CLI \(free\)/);
  assert.match(result.stdout, /https:\/\/wst2002\.github\.io\/which-ai-to-use\//);
});

test("with no AI installed, --json gives the options", (t) => {
  const { options } = JSON.parse(machine(t).run("fix the login bug", "--json").stdout);
  assert.ok(options.length >= 2);
  assert.ok(options.every((o) => o.homepage.startsWith("https://")));
  assert.ok(options.some((o) => o.free && o.install));
});

test("handoff --to any AI that can be installed offers to install it, even when it is not the suggestion", (t) => {
  const { project, run } = gitProject(t, ["claude", "gemini"]);
  const result = run("handoff", "add coupons", "--to", "aider");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Install Aider with: .+\nThen run: aider --message "Read HANDOFF\.md and continue the task\."/);
  assert.ok(fs.existsSync(path.join(project, "HANDOFF.md")));
});

test("handoff --to an installed AI that was left out starts it, since the user asked for it", (t) => {
  const { project, run } = gitProject(t, ["claude", "gemini"]);
  const log = loggingStandIn(project, "claude");
  const result = run("handoff", "add coupons", "--to", "claude-code");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Starting Claude Code: claude "Read HANDOFF\.md and continue the task\."/);
  assert.ok(fs.existsSync(log));
});

test("writing the note again, for example on hand back, keeps the task the user typed", (t) => {
  const { project, run } = gitProject(t, ["claude", "gemini"]);
  run("handoff", "add coupons to checkout", "--to", "none");
  loggingStandIn(project, "claude");
  const back = run("handoff", "--back");
  assert.equal(back.status, 0, back.stderr);
  assert.match(fs.readFileSync(path.join(project, "HANDOFF.md"), "utf8"), /^Task: add coupons to checkout$/m);
});

test("--json prints only JSON for handoff --to and fix, and never starts an AI", (t) => {
  const { project, run } = gitProject(t, ["claude", "gemini"]);
  const log = loggingStandIn(project, "gemini");
  const handoff = run("handoff", "add coupons", "--to", "gemini-cli", "--json");
  assert.equal(handoff.status, 0, handoff.stderr);
  assert.ok(JSON.parse(handoff.stdout).choices.some((c) => c.id === "gemini-cli"));
  assert.ok(!fs.existsSync(log), "--json does not start the AI");
  fs.writeFileSync(path.join(project, "package-lock.json"), "x".repeat(200000));
  const preview = JSON.parse(run("fix", "--json").stdout);
  assert.ok(preview.planned.length > 0);
  assert.deepEqual(preview.changes, []);
  const applied = JSON.parse(run("fix", "--json", "--yes").stdout);
  assert.ok(applied.changes.length > 0);
});

test("a task asked in the terminal is listed by recent, with the AI suggested", (t) => {
  const { run } = machine(t, { bins: ["claude"], files: { "src/app.js": "x" } });
  assert.match(run("recent").stdout, /^No tasks asked in this project yet\.$/m);
  assert.equal(run("add a coupon field").status, 0);
  assert.match(run("recent").stdout, /^Recent tasks in project:\n {2}1\. add a coupon field {2}→ Claude Code$/m);
});

test("Antigravity CLI's settings inside ~/.gemini do not make the checkup list Gemini CLI", (t) => {
  const { project, run } = machine(t, { bins: ["agy"] });
  fs.mkdirSync(path.join(project, "..", "home", ".gemini", "antigravity-cli"), { recursive: true });
  assert.match(run().stdout, /Your AI tools: Antigravity CLI\n/);
});

test("with only Antigravity CLI, handoff names no left-out Claude and doctor does not tick Gemini CLI", (t) => {
  const { project, run } = gitProject(t, ["agy"]);
  fs.mkdirSync(path.join(project, "..", "home", ".gemini", "antigravity-cli"), { recursive: true });
  const handoff = run("handoff", "add coupons");
  assert.equal(handoff.status, 0, handoff.stderr);
  assert.doesNotMatch(handoff.stdout, /Left out:/);
  assert.match(handoff.stdout, /Next:\s+Antigravity CLI/);
  const doctor = run("doctor").stdout;
  assert.match(doctor, /^ {2}✗ Gemini CLI \(no gemini command; settings: ~\/\.gemini\)$/m);
  assert.match(doctor, /^ {2}✓ Antigravity CLI — command: agy/m);
});
