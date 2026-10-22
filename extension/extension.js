// VS Code extension for which-ai-to-use. It loads the CLI's engine from lib/ (see scripts/sync.mjs),
// so every answer matches `npx which-ai-to-use`. Commands return their text, which the tests use.
const vscode = require("vscode");
const { spawnSync } = require("node:child_process");
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
    const [actions, detect, dashboard, page, handoff] = await Promise.all([lib("actions.mjs"), lib("detect.mjs"), lib("dashboard.mjs"), lib("dashboard-page.mjs"), lib("handoff.mjs")]);
    engine = { ...actions, detectTools: detect.detectTools, runAction: dashboard.runAction, dashboardPage: page.dashboardPage, handoffMeta: handoff.handoffMeta };
  }
  return engine;
}

function projectFolder() {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error("Open a project folder first.");
  return folder.uri.fsPath;
}

// HANDOFF.md is written at the top of the git repository, which may be above the folder open in VS Code.
function repoRoot() {
  const folder = projectFolder();
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: folder, encoding: "utf8" });
  return result.status === 0 && result.stdout.trim() ? path.resolve(result.stdout.trim()) : folder;
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
    const { checkupAction, usageAction } = await load();
    const { data } = checkupAction(await context());
    const usage = usageAction(await context()).data;
    const atRisk = data.issues.reduce((sum, issue) => sum + issue.tokens, 0);
    status.text = `$(sparkle) AI ${data.score.score}/100${atRisk ? ` · ${Math.round(atRisk / 1000)}k tokens at risk` : ""}${usage.warning ? " · $(warning) limit close" : ""}`;
    status.backgroundColor = usage.warning ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
    const reasons = data.issues.length ? data.issues.map((i) => `• ${i.problem}`).join("\n") : "Nothing is wasting your tokens.";
    status.tooltip = `${usage.warning ? `⚠ ${usage.warning}\n\n` : ""}${reasons}\n\nClick for options.`;
    status.show();
    warnOnce(usage);
  } catch {
    status.hide();
  }
}

// The limit warning pops up once per 5-hour window; after that it stays in the status bar.
let warnedWindow;
function warnOnce(usage) {
  if (!usage.warning || warnedWindow === usage.window.start) return;
  warnedWindow = usage.window.start;
  lastWarning = usage.warning;
  vscode.window.showWarningMessage(`Which AI: ${usage.warning}`, "Show usage").then((choice) => choice && COMMANDS.openFullView());
}
let lastWarning; // for the tests

let handoffChoices = []; // from the last handoff, so "Run in terminal" can only start one of those commands

/** Starts a handoff choice in a VS Code terminal (installing it first when it is not installed yet). */
function runChoice(choice) {
  const terminal = vscode.window.createTerminal({ name: `Which AI: ${choice.name}`, cwd: repoRoot() });
  terminal.show();
  if (choice.installed === false) terminal.sendText(choice.install);
  terminal.sendText(choice.command);
  lastTerminalCommand = choice.command;
}

const notices = []; // for the tests
async function notice(kind, text, ...buttons) {
  notices.push(text);
  return kind === "warning" ? vscode.window.showWarningMessage(text, ...buttons) : vscode.window.showInformationMessage(text, ...buttons);
}

// HANDOFF.md written because Claude's limit ran out: offer to hand it back once the limit resets. When the Claude Code
// plugin wrote it (by=hook), nobody has picked who carries on yet, so offer that too; a handoff the user ran already asked.
let noticedHandoff;
async function onHandoffWritten(uri) {
  const { handoffMeta, nextChoices } = await load();
  let text;
  try {
    text = fs.readFileSync(uri.fsPath, "utf8");
  } catch {
    return;
  }
  const meta = handoffMeta(text);
  if (meta?.from !== "claude-code") return;
  scheduleHandBack(uri, meta);
  if (meta.by !== "hook") return;
  const key = `${uri.fsPath}:${meta.resets}`;
  if (noticedHandoff === key) return;
  noticedHandoff = key;
  const choices = nextChoices(await context());
  handoffChoices = choices;
  const recommended = choices.find((c) => c.recommended && c.command);
  const buttons = [recommended && `Continue in ${recommended.name}`, "Other choices…"].filter(Boolean);
  const picked = await notice("warning", "Claude's limit was reached. HANDOFF.md is ready.", ...buttons);
  if (picked === "Other choices…") {
    const item = await vscode.window.showQuickPick(
      choices.filter((c) => c.command || c.id === "web").map((c) => ({ label: c.name, description: c.recommended ? "recommended" : "", detail: c.why, choice: c })),
      { placeHolder: "Who carries on?" },
    );
    if (item?.choice.command) runChoice(item.choice);
    else if (item) await vscode.env.clipboard.writeText(text);
  } else if (picked) runChoice(recommended);
}

// Notes waiting for Claude's limit to reset, checked against the clock every minute: a single long timer would
// fire late after the laptop sleeps, since timers do not count time asleep.
const handBacks = new Map();
const STALE = 12 * 60 * 60 * 1000;
let state; // workspaceState: hand-back offers already answered
function scheduleHandBack(uri, meta) {
  if (!meta.resets || state?.get(`handBack:${meta.resets}`)) return;
  handBacks.set(uri.fsPath, { uri, meta });
  checkHandBacks();
}

function checkHandBacks() {
  for (const [file, { uri, meta }] of handBacks) {
    if (meta.resets > Date.now()) continue;
    handBacks.delete(file);
    offerHandBack(uri, meta);
  }
}

async function offerHandBack(uri, meta) {
  const { handoffMeta } = await load();
  let still;
  try {
    still = handoffMeta(fs.readFileSync(uri.fsPath, "utf8"));
  } catch {
    return; // HANDOFF.md is gone: the task is done.
  }
  if (still?.resets !== meta.resets) return;
  await state?.update(`handBack:${meta.resets}`, true);
  const picked = await notice("info", "Claude's limit has reset. Hand the task back to Claude?", "Hand back to Claude");
  if (picked) await COMMANDS.handBack();
}
let lastTerminalCommand; // for the tests
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
  if (message?.type === "runInTerminal") {
    // Only a command from the last handoff runs, looked up by its id; the page never sends a command line.
    const choice = handoffChoices.find((c) => c.id === message.choice && c.command);
    if (choice) runChoice(choice);
    return null;
  }
  if (message?.type === "openFull") {
    await COMMANDS.openFullView();
    return null;
  }
  if (message?.type !== "action") return null;
  try {
    const { runAction, detectTools } = await load();
    const data = await runAction(String(message.action), message.body ?? {}, { cwd: projectFolder(), home: os.homedir(), detect: detectTools });
    if (message.action === "fix" && message.body?.apply) await refreshStatus();
    if (message.action === "handoff") handoffChoices = data.data.choices;
    // Nothing installed yet: "Install and start" may run one of the suggested AIs.
    if (message.action === "newcomer") handoffChoices = data.data.options.filter((o) => o.command).map((o) => ({ ...o, installed: false }));
    return { id: message.id, data };
  } catch (error) {
    return { id: message.id, error: error.message };
  }
}

let sidebarAsked; // the last action a dashboard page asked for, so tests can see its script really runs

/** Shows the dashboard page in a webview: the narrow sidebar or the full view in an editor tab. */
async function renderDashboard(webview, surface) {
  webview.options = { enableScripts: true };
  if (!vscode.workspace.workspaceFolders?.length) {
    webview.html = `<!doctype html><html><body style="padding:12px;font-family:var(--vscode-font-family);color:var(--vscode-foreground)">Open a project folder to see what wastes your AI tokens.</body></html>`;
    return;
  }
  const { dashboardPage } = await load();
  webview.onDidReceiveMessage(async (message) => {
    if (message?.type === "action") sidebarAsked = message.action;
    const reply = await handleMessage(message);
    if (reply) webview.postMessage(reply);
  });
  webview.html = dashboardPage({ token: "", project: path.basename(projectFolder()), version, bridge: "vscode", nonce: randomBytes(16).toString("hex"), surface });
}

let sidebar;
const sidebarProvider = {
  async resolveWebviewView(view) {
    sidebar = view;
    await renderDashboard(view.webview, "sidebar");
  },
};

let fullView;

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
    const task = given ?? (await vscode.window.showInputBox({ prompt: "What were you working on? (leave empty to read it from the Claude Code chat)" }));
    if (task === undefined) return undefined;
    const skip = leaveOutClaude ?? (await vscode.window.showQuickPick(["Yes, leave out Claude Code", "No"], { placeHolder: "Claude's limit is over: leave it out?" })) === "Yes, leave out Claude Code";
    const { handoffAction } = await load();
    const { text, data } = handoffAction({ ...(await context()), task, leftOut: skip ? ["claude-code"] : [], menu: true });
    handoffChoices = data.choices;
    show("Handoff", text);
    // Same choices as the terminal: the recommended AI first; picking one starts it in a VS Code terminal.
    if (given === undefined) {
      const item = await vscode.window.showQuickPick(
        data.choices.filter((c) => c.id !== "none").map((c) => ({ label: c.name, description: c.recommended ? "recommended" : c.installed === false ? "not installed" : "", detail: c.why, choice: c })),
        { placeHolder: "Who carries on?" },
      );
      if (item?.choice.command) runChoice(item.choice);
      else if (item?.choice.id === "web") await vscode.env.clipboard.writeText(data.note);
    }
    return text;
  },
  openSidebar() {
    return vscode.commands.executeCommand("workbench.view.extension.whichAi");
  },
  async handBack() {
    const { handoffAction } = await load();
    const result = handoffAction({ ...(await context()), task: "", leftOut: [] });
    handoffChoices = result.data.choices;
    const claude = handoffChoices.find((c) => c.id === "claude-code" && c.installed !== false);
    if (!claude) {
      vscode.window.showWarningMessage("Which AI: Claude Code was not found on this laptop, so the task cannot go back to it.");
      return result.text;
    }
    runChoice(claude);
    return result.text;
  },
  async openFullView() {
    if (fullView) {
      fullView.reveal();
      return fullView.webview.html;
    }
    fullView = vscode.window.createWebviewPanel("whichAi.full", "Which AI", vscode.ViewColumn.Active, { enableScripts: true, retainContextWhenHidden: true });
    fullView.onDidDispose(() => (fullView = undefined));
    await renderDashboard(fullView.webview, "panel");
    return fullView.webview.html;
  },
  async menu() {
    const items = [
      { label: "$(layout-sidebar-left) Open the Which AI sidebar", command: "whichAi.openSidebar" },
      { label: "$(link-external) Open the full dashboard", command: "whichAi.openFullView" },
      { label: "$(pulse) Checkup", command: "whichAi.checkup" },
      { label: "$(compass) Which AI for a task?", command: "whichAi.task" },
      { label: "$(wrench) Fix wasted tokens", command: "whichAi.fix" },
      { label: "$(star) AI setup score", command: "whichAi.score" },
      { label: "$(arrow-swap) Claude limit over? Write a handoff", command: "whichAi.handoff" },
      { label: "$(history) Claude limit reset? Hand the task back", command: "whichAi.handBack" },
    ];
    const pick = await vscode.window.showQuickPick(items, { placeHolder: "Which AI to Use" });
    if (pick) return vscode.commands.executeCommand(pick.command);
    return undefined;
  },
};

function activate(extension) {
  state = extension.workspaceState;
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
  // HANDOFF.md at the top of the repository: written now (limit reached) or left from before (offer to hand back on reset).
  if (vscode.workspace.workspaceFolders?.length) {
    const root = vscode.Uri.file(repoRoot());
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(root, "HANDOFF.md"));
    watcher.onDidCreate(onHandoffWritten);
    watcher.onDidChange(onHandoffWritten);
    const clock = setInterval(checkHandBacks, 60 * 1000);
    extension.subscriptions.push(watcher, { dispose: () => clearInterval(clock) }, vscode.window.onDidChangeWindowState((w) => w.focused && checkHandBacks()));
    const existing = vscode.Uri.joinPath(root, "HANDOFF.md");
    load().then(({ handoffMeta }) => {
      try {
        const meta = handoffMeta(fs.readFileSync(existing.fsPath, "utf8"));
        // A note whose limit reset long ago is from an old session: no offer on every start.
        if (meta?.from === "claude-code" && meta.resets > Date.now() - STALE) scheduleHandBack(existing, meta);
      } catch {
        // No HANDOFF.md: nothing to hand back.
      }
    });
  }
  return { refreshStatus, statusText: () => status.text, handleMessage, sidebarHtml: () => sidebar?.webview.html, sidebarAsked: () => sidebarAsked, lastTerminalCommand: () => lastTerminalCommand, lastWarning: () => lastWarning, notices: () => [...notices] };
}

function deactivate() {}

module.exports = { activate, deactivate };
