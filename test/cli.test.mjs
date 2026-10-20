import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const cli = path.resolve(import.meta.dirname, "../bin/cli.mjs");

function machine(t, { bins = [], files = {} } = {}) {
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
      env: { ...process.env, PATH: bin, HOME: home, USERPROFILE: home },
      encoding: "utf8",
      input: "",
    });
  return { project, run };
}

test("no arguments prints help", (t) => {
  const result = machine(t).run();
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Usage:/);
  assert.match(result.stdout, /doctor/);
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
