// Runs inside the test VS Code against the throwaway project from run.mjs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");

const run = (command, ...args) => vscode.commands.executeCommand(command, ...args);

async function check(name, test) {
  try {
    await test();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.log(`  ✗ ${name}`);
    throw error;
  }
}

exports.run = async () => {
  const project = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const api = await vscode.extensions.getExtension("wst2002.which-ai-to-use").activate();

  await check("status bar shows the score and tokens at risk", async () => {
    await api.refreshStatus();
    assert.match(api.statusText(), /^\$\(sparkle\) AI \d+\/100 · 10k tokens at risk$/);
  });

  await check("checkup matches the CLI", async () => {
    assert.match(await run("whichAi.checkup"), /package-lock\.json is ~10,240 tokens/);
  });

  await check("task advice names the best AI anywhere and the right file", async () => {
    const text = await run("whichAi.task", "make the hero section look better");
    assert.match(text, /design \(UI\)/);
    assert.match(text, /① Best AI for this task \(any tool\)/);
    assert.match(text, /src\/components\/Hero\.tsx/);
  });

  await check("score returns a line to share", async () => {
    const { text, share } = await run("whichAi.score");
    assert.match(text, /AI setup score: \d+\/100/);
    assert.match(share, /npx which-ai-to-use score$/);
  });

  await check("the sidebar opens with the dashboard inside", async () => {
    await run("whichAi.openSidebar");
    for (let i = 0; i < 50 && !api.sidebarHtml(); i++) await new Promise((done) => setTimeout(done, 100));
    const html = api.sidebarHtml();
    assert.match(html, /const vscodeApi = acquireVsCodeApi\(\);/);
    assert.match(html, /script-src 'nonce-[a-f0-9]{32}'/);
    // The page's own script asks for the checkup on load: proof it runs under the sidebar's CSP.
    for (let i = 0; i < 50 && !api.sidebarAsked(); i++) await new Promise((done) => setTimeout(done, 100));
    assert.equal(api.sidebarAsked(), "checkup");
  });

  await check("sidebar buttons get the same answers as the CLI", async () => {
    const reply = await api.handleMessage({ type: "action", id: 7, action: "checkup", body: {} });
    assert.equal(reply.id, 7);
    assert.match(reply.data.text, /package-lock\.json is ~10,240 tokens/);
    const failed = await api.handleMessage({ type: "action", id: 8, action: "nope", body: {} });
    assert.deepEqual(failed, { id: 8, error: "unknown action nope" });
  });

  await check("the sidebar's copy button uses the VS Code clipboard", async () => {
    await api.handleMessage({ type: "copy", text: "npx which-ai-to-use score" });
    assert.equal(await vscode.env.clipboard.readText(), "npx which-ai-to-use score");
  });

  await check("handoff writes HANDOFF.md", async () => {
    assert.match(await run("whichAi.handoff", "add coupons", true), /Wrote HANDOFF\.md/);
    assert.ok(fs.existsSync(path.join(project, "HANDOFF.md")));
  });

  await check("fix applies only when asked, then the status bar updates", async () => {
    const preview = await run("whichAi.fix", false);
    assert.match(preview, /package-lock\.json → \.claude\/settings\.json \(Claude Code\)/);
    assert.ok(!fs.existsSync(path.join(project, ".claude", "settings.json")), "preview must not write");
    assert.match(await run("whichAi.fix", true), /Updated \.claude\/settings\.json/);
    assert.doesNotMatch(api.statusText(), /tokens at risk/);
  });
};
