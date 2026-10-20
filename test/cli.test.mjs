import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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

test("a clean project checkup says nothing is wasted", (t) => {
  const result = machine(t, { bins: ["claude"], files: { "src/app.js": "x" } }).run();
  assert.match(result.stdout, /Nothing is wasting your tokens here/);
});

test("recommends from the tools on this machine", (t) => {
  const result = machine(t, { bins: ["claude", "gemini"] }).run("add", "two-factor", "login");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Best:\s+Claude Code/);
  assert.match(result.stdout, /claude "add two-factor login"/);
  assert.match(result.stdout, /Free:\s+Gemini CLI/);
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

test("handoff outside a git repository fails with a fix", (t) => {
  const result = machine(t, { bins: ["claude"] }).run("handoff");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /handoff needs a git repository/);
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
