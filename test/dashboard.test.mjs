import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { runAction, startDashboard } from "../src/dashboard.mjs";

const claudeOnly = () => [{ id: "claude-code", name: "Claude Code", onPath: true, via: ["command: claude"] }];

async function dashboard(t, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-dash-"));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  const server = await startDashboard({ cwd: dir, home: dir, detect: claudeOnly });
  t.after(async () => {
    await server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const call = (action, body = {}, headers = {}) =>
    fetch(`http://127.0.0.1:${server.port}/api/${action}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-dashboard-token": server.token, ...headers },
      body: JSON.stringify(body),
    });
  return { dir, server, call };
}

test("the page opens only with the token from the terminal link", async (t) => {
  const { server } = await dashboard(t);
  assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/\?t=[a-f0-9]{32}$/);
  const page = await fetch(server.url);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /which-ai-to-use/);
  assert.equal((await fetch(`http://127.0.0.1:${server.port}/`)).status, 403);
});

test("buttons run the same commands as the CLI", async (t) => {
  const { call } = await dashboard(t, { "package-lock.json": "x".repeat(40 * 1024), "src/login.js": "x" });
  const checkup = await (await call("checkup")).json();
  assert.match(checkup.text, /package-lock\.json is ~10,240 tokens/);
  const task = await (await call("task", { task: "fix the login bug" })).json();
  assert.match(task.text, /Claude Code: .+\n\s+✓ It's on your laptop, use it\./);
  assert.match(task.text, /src\/login\.js/);
  const doctor = await (await call("doctor")).json();
  assert.match(doctor.text, /✓ Claude Code/);
});

test("fix previews first and writes only when asked to apply", async (t) => {
  const { dir, call } = await dashboard(t, { "package-lock.json": "x".repeat(40 * 1024) });
  const preview = await (await call("fix")).json();
  assert.match(preview.text, /package-lock\.json → \.claude\/settings\.json/);
  assert.equal(fs.existsSync(path.join(dir, ".claude", "settings.json")), false);
  const applied = await (await call("fix", { apply: true })).json();
  assert.match(applied.text, /Updated \.claude\/settings\.json/);
  assert.ok(fs.existsSync(path.join(dir, ".claude", "settings.json")));
});

test("errors come back as messages, not crashes", async (t) => {
  const { call } = await dashboard(t);
  const empty = await call("task", { task: "  " });
  assert.equal(empty.status, 400);
  assert.match((await empty.json()).error, /task is empty/);
  assert.equal((await call("rm-rf")).status, 404);
});

test("other websites cannot call the dashboard", async (t) => {
  const { server, call } = await dashboard(t);
  assert.equal((await call("checkup", {}, { "x-dashboard-token": "wrong" })).status, 403);
  assert.equal((await call("checkup", {}, { origin: "https://evil.example" })).status, 403);
  // fetch() cannot set Host, so a raw request plays a DNS-rebinding page that reached 127.0.0.1 under its own name.
  const reboundStatus = await new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: server.port, path: "/api/checkup", method: "POST", headers: { host: "evil.example", "x-dashboard-token": server.token } },
      (res) => resolve(res.statusCode),
    );
    req.on("error", reject);
    req.end("{}");
  });
  assert.equal(reboundStatus, 403);
});

test("answers carry structured data for the page", async (t) => {
  const { call } = await dashboard(t, { "package-lock.json": "x".repeat(40 * 1024), "src/hero.js": "x" });
  const checkup = (await (await call("checkup")).json()).data;
  assert.deepEqual(checkup.installed.map((f) => f.name), ["Claude Code"]);
  assert.equal(checkup.issues[0].kind, "heavy-files");
  assert.equal(checkup.issues[0].tokens, 10240);
  const task = (await (await call("task", { task: "make the hero look better" })).json()).data;
  assert.deepEqual(task.labels, ["design (UI)"]);
  assert.equal(task.best.name, "Claude Code");
  assert.ok(task.suggested.length > 0);
});

test("AI mode and slim ask for consent before anything is sent", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-dash-ai-"));
  fs.writeFileSync(path.join(dir, "CLAUDE.md"), `# Rules\n${"- keep it small\n".repeat(700)}`);
  let asked = 0;
  const ask = async (runner, question) => {
    asked++;
    return question.includes("<<<ORIGINAL")
      ? { ok: true, text: "<<<FILE\n# Rules\n- keep it small\nFILE>>>", seconds: 1 }
      : { ok: true, text: '{"best_anywhere":"claude-code","best_installed":"claude-code","model":"","why":"Fine.","prompt":"Do it","steps":[]}', seconds: 1 };
  };
  const server = await startDashboard({ cwd: dir, home: dir, detect: claudeOnly, ask });
  t.after(async () => { await server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const call = async (action, body = {}) =>
    (await fetch(`http://127.0.0.1:${server.port}/api/${action}`, { method: "POST", headers: { "content-type": "application/json", "x-dashboard-token": server.token }, body: JSON.stringify(body) })).json();

  assert.equal((await call("ai", { task: "fix the bug" })).data.needsConsent, true);
  assert.equal((await call("slim")).data.needsConsent, true);
  assert.equal(asked, 0);

  const ai = await call("ai", { task: "fix the bug", consent: true });
  assert.equal(ai.data.answer.bestInstalledName, "Claude Code");
  const slim = await call("slim", { consent: true });
  assert.equal(slim.data.written, "CLAUDE.slim.md");
  assert.equal(asked, 2);
  const usage = await call("usage");
  assert.equal(usage.data.found, false);
});

test("runAction gives the sidebar the same answers as the server, and leaves out tools on request", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-run-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "package-lock.json"), "x".repeat(40 * 1024));
  const two = () => [...claudeOnly(), { id: "gemini-cli", name: "Gemini CLI", onPath: true, via: ["command: gemini"] }];
  const checkup = await runAction("checkup", {}, { cwd: dir, home: dir, detect: two });
  assert.match(checkup.text, /package-lock\.json is ~10,240 tokens/);
  const task = await runAction("task", { task: "fix the login bug", without: ["claude-code"] }, { cwd: dir, home: dir, detect: two });
  assert.equal(task.data.best.id, "gemini-cli");
  await assert.rejects(runAction("format-disk", {}, { cwd: dir, home: dir, detect: two }), /unknown action format-disk/);
});

test("the page talks to the local server by default and to VS Code only in the sidebar", async () => {
  const { dashboardPage } = await import("../src/dashboard-page.mjs");
  const browser = dashboardPage({ token: "t", project: "shop", version: "1" });
  assert.match(browser, /const vscodeApi = null;/);
  assert.doesNotMatch(browser, /Content-Security-Policy/);
  const sidebar = dashboardPage({ token: "", project: "shop", version: "1", bridge: "vscode", nonce: "n0nce" });
  assert.match(sidebar, /const vscodeApi = acquireVsCodeApi\(\);/);
  assert.match(sidebar, /content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-n0nce';"/);
  assert.match(sidebar, /<script nonce="n0nce">/);
  assert.match(sidebar, /--accent: var\(--vscode-button-background\)/, "the sidebar takes its colours from the VS Code theme");
  assert.doesNotMatch(sidebar, /prefers-color-scheme|<header class="top">/);
  assert.match(browser, /prefers-color-scheme: dark/);
  assert.doesNotMatch(browser, /--vscode-/);
  for (const page of [browser, sidebar]) assert.doesNotMatch(page, /[\u{1F300}-\u{1FAFF}]/u, "no emoji in the interface");
});

test("the usage view gets the 5-hour window line", async (t) => {
  const { dir, call } = await dashboard(t);
  const log = JSON.stringify({ type: "assistant", timestamp: new Date().toISOString(), cwd: dir, message: { id: "m1", usage: { input_tokens: 700, output_tokens: 300 } } });
  fs.mkdirSync(path.join(dir, ".claude", "projects", "p"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".claude", "projects", "p", "s.jsonl"), `${log}\n`);
  const usage = await (await call("usage")).json();
  assert.match(usage.data.windowText, /^~1,000 tokens in 1 reply since \d\d:\d\d · resets about \d\d:\d\d/);
});

test("the menu has a How to use guide and line icons, and other views still fill the summary", async () => {
  const { dashboardPage } = await import("../src/dashboard-page.mjs");
  const page = dashboardPage({ token: "t", project: "shop", version: "1" });
  assert.match(page, /data-view="guide"><svg class="i"[^>]*>.*<\/svg><span><strong>How to use<\/strong><small>Six steps to get started<\/small>/);
  assert.equal((page.match(/<button class="nav-btn"/g) ?? []).length, 10);
  assert.doesNotMatch(page, /nav-more|More tools/);
  assert.match(page, /step\("4\. Claude's limit ran out\?"/);
  assert.match(page, /if \(opening !== "checkup"\) refreshStats\(\);/);
});

test("the footer links the author's LinkedIn and the repository", async () => {
  const { dashboardPage } = await import("../src/dashboard-page.mjs");
  const page = dashboardPage({ token: "t", project: "shop", version: "1" });
  assert.match(page, /Made by <a href="https:\/\/www\.linkedin\.com\/in\/wst2002\/" target="_blank" rel="noopener">Wageesha Tripathi<\/a>/);
  assert.match(page, /<a href="https:\/\/github\.com\/WST2002\/which-ai-to-use" target="_blank" rel="noopener">GitHub<\/a>/);
});
