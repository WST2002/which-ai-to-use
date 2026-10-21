// VS Code extension for which-ai-to-use. It loads the CLI's engine from lib/ (see scripts/sync.mjs),
// so every answer matches `npx which-ai-to-use`. Commands return their text, which the tests use.
const vscode = require("vscode");
const { randomBytes } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { version } = require("./package.json");

let engine;
async function load() {
  if (!engine) {
    const lib = (file) => import(pathToFileURL(path.join(__dirname, "lib", "src", file)).href);
    const [actions, detect, dashboard, page] = await Promise.all([lib("actions.mjs"), lib("detect.mjs"), lib("dashboard.mjs"), lib("dashboard-page.mjs")]);
    engine = { ...actions, detectTools: detect.detectTools, runAction: dashboard.runAction, dashboardPage: page.dashboardPage };
  }
  return engine;
}

function projectFolder() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error("Open a project folder first.");
  return folder.uri.fsPath;
}

async function context(without = []) {
  const { detectTools } = await load();
  return { cwd: projectFolder(), home: os.homedir(), installed: detectTools().filter((found) => !without.includes(found.id)) };
}

let panel;
function show(title, text) {
  if (!panel) {
    panel = vscode.window.createWebviewPanel("whichAi", "Which AI", vscode.ViewColumn.Beside, { enableScripts: false });
    panel.onDidDispose(() => (panel = undefined));
  }
  const escape = (value) => value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  panel.title = `Which AI: ${title}`;
  panel.webview.html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:8px 16px}
h1{font-size:1.2em}pre{white-space:pre-wrap;font-family:var(--vscode-editor-font-family);font-size:var(--vscode-editor-font-size);line-height:1.55}</style>
</head><body><h1>${escape(title)}</h1><pre>${escape(text)}</pre></body></html>`;
  panel.reveal(vscode.ViewColumn.Beside, true);
}

let status;

async function refreshStatus() {
  if (!status) return;
  if (!vscode.workspace.getConfiguration("whichAi").get("statusBar") || !vscode.workspace.workspaceFolders?.length) return status.hide();
  try {
    const { checkupAction } = await load();
    const { data } = checkupAction(await context());
    const atRisk = data.issues.reduce((sum, issue) => sum + issue.tokens, 0);
    status.text = `$(sparkle) AI ${data.score.score}/100${atRisk ? ` · ${Math.round(atRisk / 1000)}k tokens at risk` : ""}`;
    status.tooltip = data.issues.length ? `${data.issues.map((i) => `• ${i.problem}`).join("\n")}\n\nClick for options.` : "Nothing is wasting your tokens. Click for options.";
    status.show();
  } catch {
    status.hide();
  }
}

const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/;

/** Messages from the sidebar page: run an action, copy text, or save the score card. */
async function handleMessage(message) {
  if (message?.type === "copy") {
    await vscode.env.clipboard.writeText(String(message.text));
    vscode.window.setStatusBarMessage("Which AI: copied", 2000);
    return null;
  }
  if (message?.type === "save") {
    const image = PNG_DATA_URL.exec(String(message.dataUrl));
    if (!image) return null;
    const target = await vscode.window.showSaveDialog({ defaultUri: vscode.Uri.file(path.join(projectFolder(), "ai-setup-score.png")), filters: { Image: ["png"] } });
    if (target) fs.writeFileSync(target.fsPath, Buffer.from(image[1], "base64"));
    return null;
  }
  if (message?.type !== "action") return null;
  try {
    const { runAction, detectTools } = await load();
    const data = await runAction(String(message.action), message.body ?? {}, { cwd: projectFolder(), home: os.homedir(), detect: detectTools });
    if (message.action === "fix" && message.body?.apply) await refreshStatus();
    return { id: message.id, data };
  } catch (error) {
    return { id: message.id, error: error.message };
  }
}

let sidebar;
let sidebarAsked; // the last action the sidebar page asked for, so tests can see its script really runs
const sidebarProvider = {
  async resolveWebviewView(view) {
    sidebar = view;
    view.webview.options = { enableScripts: true };
    if (!vscode.workspace.workspaceFolders?.length) {
      view.webview.html = `<!doctype html><html><body style="padding:12px;font-family:var(--vscode-font-family);color:var(--vscode-foreground)">Open a project folder to see what wastes your AI tokens.</body></html>`;
      return;
    }
    const { dashboardPage } = await load();
    view.webview.onDidReceiveMessage(async (message) => {
      if (message?.type === "action") sidebarAsked = message.action;
      const reply = await handleMessage(message);
      if (reply) view.webview.postMessage(reply);
    });
    view.webview.html = dashboardPage({ token: "", project: path.basename(projectFolder()), version, bridge: "vscode", nonce: randomBytes(16).toString("hex") });
  },
};

const COMMANDS = {
  async checkup() {
    const { checkupAction } = await load();
    const { text } = checkupAction(await context());
    show("Checkup", text);
    return text;
  },
  async task(given) {
    const task = given ?? (await vscode.window.showInputBox({ prompt: "What do you want to do?", placeHolder: "e.g. make the hero section look better" }));
    if (!task?.trim()) return undefined;
    const { recommendAction } = await load();
    const { text, data } = recommendAction({ ...(await context()), task });
    show("Which AI for this task", text);
    if (data.best && given === undefined) {
      const choice = await vscode.window.showInformationMessage(`Best of yours: ${data.best.name}`, "Copy command");
      if (choice) await vscode.env.clipboard.writeText(data.best.command);
    }
    return text;
  },
  async fix(apply) {
    const { fixAction } = await load();
    const preview = fixAction(await context());
    show("Fix wasted tokens", preview.text);
    if (!preview.data.planned.length) return preview.text;
    const yes = apply ?? (await vscode.window.showWarningMessage("Make your AI tools skip these files?", { modal: true }, "Apply")) === "Apply";
    if (!yes) return preview.text;
    const result = fixAction({ ...(await context()), apply: true });
    show("Fix wasted tokens", result.text);
    await refreshStatus();
    return result.text;
  },
  async score() {
    const { scoreAction } = await load();
    const { text, data } = scoreAction(await context());
    show("AI setup score", text);
    return { text, share: data.share };
  },
  async handoff(given, leaveOutClaude) {
    const task = given ?? (await vscode.window.showInputBox({ prompt: "What were you working on?" }));
    if (task === undefined) return undefined;
    const skip = leaveOutClaude ?? (await vscode.window.showQuickPick(["Yes, leave out Claude Code", "No"], { placeHolder: "Claude's limit is over: leave it out?" })) === "Yes, leave out Claude Code";
    const { handoffAction } = await load();
    const { text } = handoffAction({ ...(await context(skip ? ["claude-code"] : [])), task });
    show("Handoff", text);
    return text;
  },
  openSidebar() {
    return vscode.commands.executeCommand("workbench.view.extension.whichAi");
  },
  async menu() {
    const items = [
      { label: "$(layout-sidebar-left) Open the Which AI sidebar", command: "whichAi.openSidebar" },
      { label: "$(pulse) Checkup", command: "whichAi.checkup" },
      { label: "$(compass) Which AI for a task?", command: "whichAi.task" },
      { label: "$(wrench) Fix wasted tokens", command: "whichAi.fix" },
      { label: "$(star) AI setup score", command: "whichAi.score" },
      { label: "$(arrow-swap) Claude limit over? Write a handoff", command: "whichAi.handoff" },
    ];
    const pick = await vscode.window.showQuickPick(items, { placeHolder: "Which AI to Use" });
    if (pick) return vscode.commands.executeCommand(pick.command);
    return undefined;
  },
};

function activate(extension) {
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = "whichAi.menu";
  for (const [name, run] of Object.entries(COMMANDS)) {
    extension.subscriptions.push(
      vscode.commands.registerCommand(`whichAi.${name}`, async (...args) => {
        try {
          return await run(...args);
        } catch (error) {
          vscode.window.showErrorMessage(`Which AI: ${error.message}`);
          return undefined;
        }
      }),
    );
  }
  // The score depends on these files, so it is refreshed when one of them is saved.
  const watched = /(^|[\\/])(CLAUDE\.md|AGENTS\.md|GEMINI\.md|package\.json|\.gitignore|\.cursorignore|\.geminiignore|settings\.json|\.mcp\.json)$/;
  let timer;
  extension.subscriptions.push(
    status,
    vscode.window.registerWebviewViewProvider("whichAi.dashboard", sidebarProvider),
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!watched.test(doc.fileName)) return;
      clearTimeout(timer);
      timer = setTimeout(refreshStatus, 1000);
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(refreshStatus),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration("whichAi") && refreshStatus()),
  );
  refreshStatus();
  return { refreshStatus, statusText: () => status.text, handleMessage, sidebarHtml: () => sidebar?.webview.html, sidebarAsked: () => sidebarAsked };
}

function deactivate() {}

module.exports = { activate, deactivate };
