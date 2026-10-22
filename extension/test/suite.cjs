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
    assert.match(api.statusText(), /^\$\(sparkle\) AI \d+\/100 · 10k tokens at risk · \$\(warning\) limit close$/);
  });

  await check("a window close to the busiest one warns once, from the made-up usage in the test home", async () => {
    assert.match(api.lastWarning(), /^This window is at 90% of your busiest 5-hour window this week \(~100,000 tokens\)/);
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
    for (let i = 0; i < 150 && !api.sidebarHtml(); i++) await new Promise((done) => setTimeout(done, 100));
    const html = api.sidebarHtml();
    assert.match(html, /const vscodeApi = acquireVsCodeApi\(\);/);
    assert.match(html, /script-src 'nonce-[a-f0-9]{32}'/);
    // The page's own script asks for the checkup on load: proof it runs under the sidebar's CSP.
    for (let i = 0; i < 150 && !api.sidebarAsked(); i++) await new Promise((done) => setTimeout(done, 100));
    assert.equal(api.sidebarAsked(), "checkup");
  });

  await check("the sidebar has a Full view button that opens the dashboard in an editor tab", async () => {
    assert.match(api.sidebarHtml(), /id="open-full"/);
    const html = await run("whichAi.openFullView");
    assert.match(html, /<body class="surface-panel">/);
    assert.match(html, /--bg: var\(--vscode-editor-background, /);
    // The tab list updates a moment after the panel is created.
    const labels = () => vscode.window.tabGroups.all.flatMap((group) => group.tabs.map((tab) => tab.label));
    for (let i = 0; i < 50 && !labels().includes("Which AI"); i++) await new Promise((done) => setTimeout(done, 100));
    assert.ok(labels().includes("Which AI"), `open tabs: ${labels().join(", ")}`);
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

  await check("handoff choices can be started in a VS Code terminal, only by their id", async () => {
    const reply = await api.handleMessage({ type: "action", id: 9, action: "handoff", body: { task: "add coupons" } });
    const recommended = reply.data.data.choices.find((c) => c.recommended);
    assert.equal(recommended.id, "claude-code");
    await api.handleMessage({ type: "runInTerminal", choice: "rm -rf /" });
    assert.equal(api.lastTerminalCommand(), undefined, "an unknown choice runs nothing");
    await api.handleMessage({ type: "runInTerminal", choice: "claude-code" });
    assert.equal(api.lastTerminalCommand(), recommended.command);
    assert.ok(vscode.window.terminals.some((t) => t.name === "Which AI: Claude Code"));
  });

  await check("a HANDOFF.md written after Claude's limit offers who carries on, then handing back once it resets", async () => {
    const resets = new Date(Date.now() - 1000).toISOString();
    fs.writeFileSync(path.join(project, "HANDOFF.md"), `# Handoff

Task: add coupons

<!-- which-ai-to-use: from=claude-code resets=${resets} -->
`);
    const wait = async (text) => {
      for (let i = 0; i < 100 && !api.notices().includes(text); i++) await new Promise((done) => setTimeout(done, 100));
      assert.ok(api.notices().includes(text), `notices: ${api.notices().join(" | ")}`);
    };
    await wait("Claude's limit was reached. HANDOFF.md is ready.");
    await wait("Claude's limit has reset. Hand the task back to Claude?");
    await run("whichAi.handBack");
    assert.match(api.lastTerminalCommand(), /^claude /);
  });

  await check("with no AI installed, a suggested AI can be installed and started in a terminal", async () => {
    const reply = await api.handleMessage({ type: "action", id: 11, action: "newcomer", body: { task: "build a landing page" } });
    const first = reply.data.data.options.find((o) => o.install);
    await api.handleMessage({ type: "runInTerminal", choice: first.id });
    assert.equal(api.lastTerminalCommand(), first.command);
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
