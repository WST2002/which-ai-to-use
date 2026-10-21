import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { startDashboard } from "../src/dashboard.mjs";

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
