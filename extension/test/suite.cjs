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

  await check("handoff writes HANDOFF.md", async () => {
    assert.match(await run("whichAi.handoff", "add coupons", true), /Wrote HANDOFF\.md/);
    assert.ok(fs.existsSync(path.join(project, "HANDOFF.md")));
  });

  await check("fix applies only when asked, then the status bar updates", async () => {
    const preview = await run("whichAi.fix", false);
    assert.match(preview, /package-lock\.json →/);
    const installed = !/Nothing to fix/.test(preview);
    if (installed) {
      assert.match(await run("whichAi.fix", true), /Updated/);
      assert.doesNotMatch(api.statusText(), /tokens at risk/);
    }
  });
};
