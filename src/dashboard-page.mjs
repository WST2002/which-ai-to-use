const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const SHARED = `
    --font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; --mono: ui-monospace, "Cascadia Code", Consolas, monospace;
    --size: 14px; --radius: 6px; --radius-lg: 8px;`;
const LIGHT = `${SHARED}
    --bg: #f7f7f8; --panel: #ffffff; --panel-2: #f4f4f5; --fg: #18181b; --muted: #63636b; --line: #e4e4e7;
    --accent: #2563eb; --accent-hover: #1d4ed8; --accent-fg: #ffffff; --link: #1d4ed8; --focus: #2563eb;
    --good: #15803d; --good-soft: #f0fdf4; --warn: #b45309; --warn-soft: #fffbeb; --code: #f4f4f5; --code-fg: #18181b;
    --hover: #f0f0f2; --selected-bg: #e8effd; --selected-fg: #1e40af;
    --input-bg: #ffffff; --input-border: #d4d4d8; --input-fg: #18181b; --btn2-bg: #ffffff; --btn2-fg: #18181b;`;
const DARK = `${SHARED}
    --bg: #0c0c0e; --panel: #141417; --panel-2: #1c1c20; --fg: #ededef; --muted: #a0a0a8; --line: #2a2a2f;
    --accent: #3b82f6; --accent-hover: #2563eb; --accent-fg: #ffffff; --link: #7aa7f7; --focus: #3b82f6;
    --good: #4ade80; --good-soft: #0f1f15; --warn: #fbbf24; --warn-soft: #221a0b; --code: #1c1c20; --code-fg: #ededef;
    --hover: #1e1e22; --selected-bg: #1a2742; --selected-fg: #c7d8fb;
    --input-bg: #0c0c0e; --input-border: #34343a; --input-fg: #ededef; --btn2-bg: #1c1c20; --btn2-fg: #ededef;`;
// Inside VS Code every colour, the font and the controls come from the user's theme, so the sidebar looks native.
const VSCODE = `
    --font: var(--vscode-font-family); --mono: var(--vscode-editor-font-family); --size: var(--vscode-font-size, 13px); --radius: 2px; --radius-lg: 4px;
    --bg: var(--vscode-sideBar-background, var(--vscode-editor-background)); --panel: var(--vscode-sideBar-background, var(--vscode-editor-background));
    --panel-2: var(--vscode-editorWidget-background); --fg: var(--vscode-foreground); --muted: var(--vscode-descriptionForeground);
    --line: var(--vscode-widget-border, var(--vscode-panel-border, rgba(128, 128, 128, .35)));
    --accent: var(--vscode-button-background); --accent-hover: var(--vscode-button-hoverBackground); --accent-fg: var(--vscode-button-foreground);
    --link: var(--vscode-textLink-foreground); --focus: var(--vscode-focusBorder);
    --good: var(--vscode-testing-iconPassed, #3fb950); --good-soft: color-mix(in srgb, var(--vscode-testing-iconPassed, #3fb950) 10%, transparent);
    --warn: var(--vscode-editorWarning-foreground, #cca700); --warn-soft: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 10%, transparent);
    --code: var(--vscode-textCodeBlock-background); --code-fg: var(--vscode-editor-foreground);
    --hover: var(--vscode-list-hoverBackground); --selected-bg: var(--vscode-list-activeSelectionBackground); --selected-fg: var(--vscode-list-activeSelectionForeground);
    --input-bg: var(--vscode-input-background); --input-border: var(--vscode-input-border, var(--line)); --input-fg: var(--vscode-input-foreground);
    --btn2-bg: var(--vscode-button-secondaryBackground); --btn2-fg: var(--vscode-button-secondaryForeground);`;

// 16 px line icons (no emoji), drawn with the text colour.
const ICON_PATHS = {
  checkup: '<path d="M2 8.5h2.5l1.8-4.5 3 9 1.9-4.5H14"/>',
  task: '<circle cx="8" cy="8" r="6"/><path d="M10.6 5.4 9.2 9.2 5.4 10.6 6.8 6.8z"/>',
  handoff: '<path d="M3 5.5h9.5M10 3l2.5 2.5L10 8M13 10.5H3.5M6 8l-2.5 2.5L6 13"/>',
  fix: '<path d="M3 8.5 6.5 12 13 4"/>',
  tokens: '<path d="M3.5 13V9M8 13V4M12.5 13V7"/>',
  score: '<path d="M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.4l-3.6 1.9.7-4-2.9-2.8 4-.6z"/>',
  usage: '<circle cx="8" cy="8" r="6"/><path d="M8 4.8V8l2.2 1.6"/>',
  slim: '<path d="M3 4.5h10M3 8h7M3 11.5h4"/>',
  doctor: '<rect x="2.5" y="3" width="11" height="8" rx="1"/><path d="M5.5 13.5h5"/>',
  guide: '<circle cx="8" cy="8" r="6"/><path d="M6.4 6.3a1.7 1.7 0 0 1 3.2.6c0 1.1-1.6 1.4-1.6 2.4M8 11.3v.1"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
};
const icon = (name) => `<svg class="i" viewBox="0 0 16 16" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
const NAV = [
  ["checkup", "Checkup"],
  ["task", "Pick an AI"],
  ["handoff", "Limit over?"],
  ["fix", "Fix tokens"],
  ["usage", "Usage"],
  ["score", "Score card"],
  ["tokens", "Token details"],
  ["slim", "Trim rules"],
  ["doctor", "Installed tools"],
  ["guide", "How to use"],
];

/**
 * The single dashboard page. Every value from the server is inserted with textContent, never as HTML.
 * `bridge`: "http" talks to the local server; "vscode" talks to the extension's sidebar through postMessage.
 */
export function dashboardPage({ token, project, version, bridge = "http", nonce = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${bridge === "vscode" ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">` : ""}
<title>which-ai-to-use — ${escapeHtml(project)}</title>
<style>
  :root {${bridge === "vscode" ? VSCODE : LIGHT}
  }
${bridge === "vscode" ? "" : `  @media (prefers-color-scheme: dark) {
    :root {${DARK}
    }
  }`}
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { background: var(--bg); color: var(--fg); font: var(--size)/1.5 var(--font); -webkit-font-smoothing: antialiased; }
  button, input { font: inherit; color: inherit; }
  svg.i { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }

  .top { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 12px; height: 52px;
    padding: 0 clamp(16px, 3vw, 32px); background: var(--panel); border-bottom: 1px solid var(--line); }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 15px; letter-spacing: -.01em; }
  .mark { width: 18px; height: 18px; border-radius: 5px; background: var(--accent); }
  .brand .project { color: var(--muted); font-weight: 400; }
  .meta { margin-left: auto; display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12.5px; white-space: nowrap; }
  .meta svg.i { width: 14px; height: 14px; color: var(--good); }

  .layout { display: grid; grid-template-columns: 232px minmax(0, 1fr); gap: 24px; padding: 24px clamp(16px, 3vw, 32px); max-width: 1400px; margin: 0 auto; }
  /* Grid items default to min-width: auto, so a long command would stretch the whole column. */
  main { min-width: 0; }
  nav { position: sticky; top: 76px; align-self: start; display: flex; flex-direction: column; gap: 2px; }
  .nav-btn { display: flex; gap: 10px; align-items: center; width: 100%; min-width: 0; height: 34px; padding: 0 10px; border-radius: var(--radius);
    border: 0; background: transparent; color: var(--muted); text-align: left; cursor: pointer; }
  .nav-btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nav-btn:hover { background: var(--hover); color: var(--fg); }
  .nav-btn[aria-current="true"] { background: var(--selected-bg); color: var(--selected-fg); font-weight: 500; }
  .nav-btn:focus-visible, .btn:focus-visible, input:focus-visible { outline: 1px solid var(--focus); outline-offset: 1px; }

  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
  .stat { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 12px 14px; min-width: 0; }
  .stat .label { color: var(--muted); font-size: 12px; }
  .stat .value { font-size: 22px; font-weight: 600; letter-spacing: -.02em; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .stat .value.warn { color: var(--warn); }
  .stat .value.good { color: var(--good); }
  .stat .muted { font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
  .chips { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
  .chip { font-size: 12px; padding: 1px 7px; border-radius: 4px; background: var(--panel-2); border: 1px solid var(--line); color: var(--muted); }
  canvas.scorecard { width: 100%; max-width: 760px; height: auto; border-radius: var(--radius-lg); border: 1px solid var(--line); display: block; }

  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-lg); }
  .panel-head { padding: 16px 18px 0; }
  .panel-head h1 { font-size: 16px; font-weight: 600; margin: 0; letter-spacing: -.01em; }
  .panel-head p { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
  .panel-body { padding: 14px 18px 18px; }
  .form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
  .form input[type=text] { flex: 1 1 260px; min-width: 0; height: 32px; padding: 0 10px; border: 1px solid var(--input-border); border-radius: var(--radius);
    background: var(--input-bg); color: var(--input-fg); }
  .check { display: flex; gap: 6px; align-items: center; color: var(--muted); font-size: 13px; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 12px; border: 1px solid transparent;
    border-radius: var(--radius); font-weight: 500; font-size: 13px; cursor: pointer; background: var(--accent); color: var(--accent-fg); text-decoration: none; white-space: nowrap; }
  .btn:hover { background: var(--accent-hover); }
  .btn.ghost { background: var(--btn2-bg); color: var(--btn2-fg); border-color: var(--line); }
  .btn.ghost:hover { background: var(--hover); }
  .btn.small { height: 26px; padding: 0 10px; font-size: 12px; }
  table.points td:first-child { width: 56px; white-space: nowrap; color: var(--warn); font-variant-numeric: tabular-nums; }
  .btn:disabled { opacity: .5; cursor: progress; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
  .card { border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 12px 14px; background: var(--panel); min-width: 0; }
  .card.best { border-color: var(--accent); grid-column: 1 / -1; }
  .card h3 { margin: 0; font-size: 14px; font-weight: 600; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .card .tag { font-size: 11px; font-weight: 500; padding: 1px 6px; border-radius: 4px; background: var(--panel-2); color: var(--muted); border: 1px solid var(--line); }
  .card .tag.star { background: var(--accent); color: var(--accent-fg); border-color: transparent; }
  .card .tag.yes { color: var(--good); border-color: color-mix(in srgb, var(--good) 45%, transparent); background: transparent; }
  .card .tag.no { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 45%, transparent); background: transparent; }
  .card.mine { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .consent { border: 1px solid color-mix(in srgb, var(--warn) 50%, var(--line)); background: var(--warn-soft); border-radius: var(--radius-lg); padding: 12px 14px; margin-bottom: 14px; }
  .consent p { margin: 6px 0 12px; white-space: pre-line; }
  ol { margin: 0; padding-left: 20px; }
  .card p { margin: 4px 0 0; color: var(--muted); }
  .card a { color: var(--link); }
  .section-title { font-size: 12px; font-weight: 600; color: var(--muted); margin: 18px 0 8px; }
  .issue { display: flex; gap: 10px; align-items: flex-start; }
  .issue .num { flex: none; width: 20px; height: 20px; border-radius: 4px; display: grid; place-items: center; font-weight: 600; font-size: 12px;
    background: var(--warn-soft); color: var(--warn); margin-top: 1px; }
  .issue .fix { color: var(--fg); margin-top: 4px; font-size: 13px; }
  .ok { padding: 10px 12px; border-radius: var(--radius); background: var(--good-soft); color: var(--good); font-weight: 500;
    border: 1px solid color-mix(in srgb, var(--good) 30%, transparent); }

  .cmd { display: flex; gap: 6px; align-items: stretch; margin-top: 8px; }
  .cmd code { flex: 1; min-width: 0; overflow-x: auto; white-space: pre; padding: 7px 10px; border-radius: var(--radius); background: var(--code); color: var(--code-fg);
    border: 1px solid var(--line); font: 12.5px/1.5 var(--mono); }
  pre.raw { margin: 0; padding: 12px 14px; border-radius: var(--radius); background: var(--code); color: var(--code-fg); border: 1px solid var(--line);
    overflow: auto; white-space: pre-wrap; font: 12.5px/1.6 var(--mono); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--line); vertical-align: top; overflow-wrap: anywhere; }
  th { color: var(--muted); font-weight: 500; font-size: 12px; }
  .status { min-height: 20px; font-size: 12.5px; color: var(--muted); margin-top: 12px; }
  .status.error { color: var(--warn); }
  .muted { color: var(--muted); }
  .hidden { display: none !important; }
  footer { text-align: center; color: var(--muted); font-size: 12px; padding: 4px 16px 24px; }
  footer a { color: inherit; }

  /* Narrow: the browser on a phone or a VS Code sidebar. The menu wraps into a grid instead of scrolling sideways. */
  @media (max-width: 900px) {
    .layout { grid-template-columns: 1fr; gap: 12px; padding: 12px; }
    nav { position: static; display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 4px; }
    .nav-btn { height: 30px; padding: 0 8px; gap: 8px; border: 1px solid var(--line); background: var(--panel); }
    .nav-btn[aria-current="true"] { border-color: var(--focus); }
    .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
    .stat { padding: 10px 12px; }
    .stat .value { font-size: 18px; }
    .stat .chips, .stat .muted { display: none; }
    .panel-head { padding: 12px 12px 0; }
    .panel-body { padding: 12px; }
    .grid { grid-template-columns: 1fr; }
    .meta .long { display: none; }
  }
  @media (max-width: 420px) {
    .top { height: 44px; padding: 0 12px; }
    .layout { padding: 10px; }
    .form input[type=text] { flex-basis: 100%; }
  }
</style>
</head>
<body>
${bridge === "vscode" ? "" : `<header class="top">
  <div class="brand"><span class="mark" aria-hidden="true"></span>which-ai-to-use<span class="project">/ ${escapeHtml(project)}</span></div>
  <div class="meta">${icon("lock")}<span class="long">Runs only on this laptop</span>${version ? `<span>· v${escapeHtml(version)}</span>` : ""}</div>
</header>`}

<div class="layout">
  <nav aria-label="Actions">
${NAV.map(([view, label]) => `    <button class="nav-btn" data-view="${view}" title="${label}">${icon(view)}<span>${label}</span></button>`).join("\n")}
  </nav>

  <main>
    <section class="stats" aria-label="Summary">
      <div class="stat"><div class="label">Your AI tools</div><div class="value" id="stat-tools">–</div><div class="chips" id="stat-tool-chips"></div></div>
      <div class="stat"><div class="label">Tokens at risk</div><div class="value" id="stat-tokens">–</div><div class="muted" id="stat-tokens-note"></div></div>
      <div class="stat"><div class="label">Add-ons on</div><div class="value" id="stat-addons">–</div><div class="muted" id="stat-addons-note"></div></div>
      <div class="stat"><div class="label">Setup score</div><div class="value" id="stat-score">–</div><div class="muted" id="stat-score-note"></div></div>
    </section>

    <section class="panel" aria-live="polite">
      <div class="panel-head"><h1 id="view-title">Checkup</h1><p id="view-sub"></p></div>
      <div class="panel-body">
        <div class="form hidden" id="form-task">
          <input type="text" id="task" placeholder="Describe the task, e.g. make the hero section look better" aria-label="Task">
          <label class="check"><input type="checkbox" id="use-ai"> Ask my AI too</label>
          <button class="btn" id="ask">Ask</button>
        </div>
        <div class="form hidden" id="form-slim">
          <button class="btn" id="slim-start">Ask my AI to shorten it</button>
        </div>
        <div class="consent hidden" id="consent" role="dialog" aria-labelledby="consent-title">
          <strong id="consent-title">Allow this?</strong>
          <p id="consent-text"></p>
          <div class="form" style="margin:0"><button class="btn" id="consent-yes">Allow and ask</button><button class="btn ghost" id="consent-no">Cancel</button></div>
        </div>
        <div class="form hidden" id="form-handoff">
          <input type="text" id="handoff-task" placeholder="What were you working on?" aria-label="Task to hand off">
          <label class="check"><input type="checkbox" id="without-claude" checked> Leave out Claude Code</label>
          <button class="btn" id="write-handoff">Write HANDOFF.md</button>
        </div>
        <div id="result"></div>
        <div class="status" id="status"></div>
      </div>
    </section>
  </main>
</div>
<footer>Made by Wageesha Tripathi · github.com/WST2002/which-ai-to-use</footer>

<script${nonce ? ` nonce="${nonce}"` : ""}>
  const TOKEN = ${JSON.stringify(token)};
  const vscodeApi = ${bridge === "vscode" ? "acquireVsCodeApi()" : "null"};
  const pending = new Map();
  let nextId = 0;
  if (vscodeApi) {
    window.addEventListener("message", ({ data: reply }) => {
      const settle = pending.get(reply.id);
      if (!settle) return;
      pending.delete(reply.id);
      settle(reply);
    });
  }

  // One way to reach the engine, whether the page is served locally or shown in the VS Code sidebar.
  function request(action, body) {
    if (vscodeApi) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, (reply) => (reply.error ? reject(new Error(reply.error)) : resolve(reply.data)));
        vscodeApi.postMessage({ type: "action", id, action, body });
      });
    }
    return fetch("/api/" + action, { method: "POST", headers: { "content-type": "application/json", "x-dashboard-token": TOKEN }, body: JSON.stringify(body) })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Something went wrong");
        return data;
      });
  }
  const copyText = (text) => (vscodeApi ? vscodeApi.postMessage({ type: "copy", text }) : navigator.clipboard.writeText(text));
  const VIEWS = {
    checkup: { title: "Checkup", sub: "Your AI tools and what is wasting tokens, in plain words." },
    task: { title: "Which AI for a task?", sub: "Describe the task. You get the best tool and model, the files to start with and the command to run." },
    handoff: { title: "Claude limit over?", sub: "Writes HANDOFF.md in your project, so another AI carries on instead of starting over." },
    fix: { title: "Fix wasted tokens", sub: "These files cost many tokens when your AI reads them. Nothing changes until you click Apply." },
    tokens: { title: "Token details", sub: "Instructions files, heavy files and add-ons, with numbers." },
    score: { title: "Score card", sub: "How lean and well-described your project is for AI tools. Download the card or copy the line to share." },
    usage: { title: "Usage", sub: "Claude Code tokens from its own logs on this laptop: numbers only, never your messages." },
    slim: { title: "Shorten CLAUDE.md", sub: "Your instructions file is sent with every message. Your AI writes a shorter copy next to it; you decide whether to use it." },
    doctor: { title: "Installed tools", sub: "Which AI tools this laptop has and which instructions files this project has." },
    guide: { title: "How to use", sub: "Six steps: check, fix, pick an AI, hand off, watch the limit, share." },
  };
  const $ = (id) => document.getElementById(id);
  const result = $("result");
  const status = $("status");

  // Builds elements with textContent only, so nothing from the server is ever parsed as HTML.
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    for (const child of children.flat()) if (child) node.append(child);
    return node;
  }
  const tokens = (n) => "~" + Number(n).toLocaleString("en-US");
  const sentence = (s) => s.charAt(0).toUpperCase() + s.slice(1) + ".";

  function command(text) {
    const button = el("button", { class: "btn ghost small", text: "Copy", onclick: () => { copyText(text); button.textContent = "Copied"; setTimeout(() => (button.textContent = "Copy"), 1500); } });
    return el("div", { class: "cmd" }, el("code", { text }), button);
  }

  async function call(action, body = {}) {
    document.querySelectorAll("button").forEach((b) => (b.disabled = true));
    status.className = "status";
    status.textContent = "Running…";
    try {
      const data = await request(action, body);
      status.textContent = "Updated " + new Date().toLocaleTimeString();
      return data;
    } catch (error) {
      status.className = "status error";
      status.textContent = error.message;
      return null;
    } finally {
      document.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  }

  function updateStats(data) {
    $("stat-tools").textContent = data.installed.length;
    $("stat-tool-chips").replaceChildren(...data.installed.map((t) => el("span", { class: "chip", text: t.name })));
    const atRisk = data.issues.reduce((sum, i) => sum + i.tokens, 0);
    $("stat-tokens").textContent = atRisk ? tokens(atRisk) : "0";
    $("stat-tokens").className = "value " + (atRisk ? "warn" : "good");
    $("stat-tokens-note").textContent = atRisk ? "in files your AI may read or gets every message" : "nothing heavy found";
    const addons = [...new Set(data.mcp.map((m) => m.name))];
    $("stat-addons").textContent = addons.length;
    $("stat-addons-note").textContent = addons.length ? addons.slice(0, 4).join(", ") + (addons.length > 4 ? "…" : "") : "none";
    $("stat-score").textContent = data.score.score + "/100";
    $("stat-score").className = "value " + (data.score.score >= 75 ? "good" : "warn");
    $("stat-score-note").textContent = "Grade " + data.score.grade;
  }

  // Draws a 1200×630 share card (the usual link-preview size) so it can be downloaded as a PNG.
  function drawScoreCard(data) {
    const canvas = el("canvas", { class: "scorecard", width: "1200", height: "630", role: "img", "aria-label": "AI setup score " + data.score + " out of 100" });
    const c = canvas.getContext("2d");
    const font = (size, weight = 600) => weight + " " + size + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
    const mono = (size) => "500 " + size + "px ui-monospace, Consolas, monospace";
    c.fillStyle = "#0f1115";
    c.fillRect(0, 0, 1200, 630);
    c.strokeStyle = "#24262d";
    c.lineWidth = 2;
    c.strokeRect(1, 1, 1198, 628);

    c.fillStyle = "#3b82f6";
    c.fillRect(72, 66, 22, 22);
    c.fillStyle = "#e4e4e7";
    c.font = font(24, 600);
    c.fillText("which-ai-to-use", 108, 86);
    c.fillStyle = "#fafafa";
    c.font = font(52, 700);
    c.fillText("AI setup score", 72, 178);
    c.fillStyle = "#9ca3af";
    c.font = font(26, 400);
    c.fillText("Project: " + data.project, 72, 222);

    const color = data.score >= 75 ? "#22c55e" : data.score >= 60 ? "#f59e0b" : "#ef4444";
    c.lineWidth = 16;
    c.lineCap = "round";
    c.strokeStyle = "#24262d";
    c.beginPath(); c.arc(930, 300, 140, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = color;
    c.beginPath(); c.arc(930, 300, 140, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * data.score) / 100); c.stroke();
    c.textAlign = "center";
    c.fillStyle = "#fafafa";
    c.font = font(104, 700);
    c.fillText(String(data.score), 930, 330);
    c.fillStyle = "#9ca3af";
    c.font = font(24, 500);
    c.fillText("out of 100", 930, 372);
    c.fillStyle = color;
    c.font = font(28, 600);
    c.fillText("Grade " + data.grade, 930, 482);
    c.textAlign = "left";

    c.font = font(28, 500);
    let y = 300;
    const lines = data.items.length ? data.items.slice(0, 4).map((i) => i.short) : ["Lean, well-described project"];
    for (const line of lines) {
      c.fillStyle = data.items.length ? "#f59e0b" : "#22c55e";
      c.beginPath(); c.arc(80, y - 9, 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#d4d4d8";
      c.fillText(line, 100, y);
      y += 44;
    }

    c.fillStyle = "#24262d";
    c.fillRect(72, 500, 1056, 2);
    c.fillStyle = "#e4e4e7";
    c.font = font(26, 600);
    c.fillText(data.saving ? "Fixing it saves ~" + data.saving.toLocaleString("en-US") + " tokens" : "Nothing to fix", 72, 560);
    c.textAlign = "right";
    c.fillStyle = "#60a5fa";
    c.font = mono(24);
    c.fillText("npx which-ai-to-use score", 1128, 560);
    c.textAlign = "left";
    return canvas;
  }

  const RENDER = {
    checkup(data) {
      updateStats(data);
      if (!data.issues.length) return [el("div", { class: "ok", text: "Nothing is wasting your tokens here." })];
      return [
        el("div", { class: "section-title", text: data.issues.length + (data.issues.length === 1 ? " thing is" : " things are") + " wasting your tokens" }),
        el("div", { class: "grid" }, data.issues.map((issue, i) =>
          el("div", { class: "card" },
            el("div", { class: "issue" },
              el("span", { class: "num", text: String(i + 1) }),
              el("div", {},
                el("div", { text: issue.problem }),
                el("div", { class: "fix", text: "→ " + issue.fix.replace("npx which-ai-to-use fix", "click Fix tokens") }),
                issue.kind === "heavy-files" ? el("button", { class: "btn small", style: "margin-top:10px", text: "Fix it", onclick: () => show("fix") }) : null)))),
        ),
      ];
    },
    task(data) {
      const parts = [el("p", { class: "muted", text: "Task type: " + data.labels.join(", ") })];
      if (!data.best) return parts.concat(data.notes.map((n) => el("p", { text: n })));
      const o = data.overall;
      const more = o.alsoGreat.length > 2 ? " and " + (o.alsoGreat.length - 2) + " more" : "";
      parts.push(
        el("div", { class: "section-title", text: "① Best AI for this task (any tool)" }),
        el("div", { class: "card best" },
          el("h3", {}, o.name, el("span", { class: "tag " + (o.installed ? "yes" : "no"), text: o.installed ? "✓ On your laptop" : "✗ Not on your laptop" })),
          el("p", { text: sentence(o.why) }),
          o.installed ? el("p", { text: "You already have it: use the command below." })
            : el("p", {}, "Get it: ", el("a", { href: o.homepage, target: "_blank", rel: "noopener", text: o.homepage.replace("https://", "") })),
          o.alsoGreat.length ? el("p", { text: "Just as good: " + o.alsoGreat.slice(0, 2).join(", ") + more }) : null),
      );
      const yours = [data.best, ...data.also];
      if (data.free && !yours.some((t) => t.id === data.free.id)) yours.push(data.free);
      parts.push(
        el("div", { class: "section-title", text: "② On your laptop: " + yours.map((t) => t.name).join(", ") }),
        el("div", { class: "card mine" },
          el("h3", {}, data.best.name, el("span", { class: "tag star", text: "Best of yours" }), el("span", { class: "tag", text: data.best.where })),
          data.best.id !== o.id ? el("p", { text: sentence(data.best.why) }) : null,
          command(data.best.command),
          data.best.model ? el("p", { text: "Model: " + data.best.model }) : null,
          data.files.length ? el("p", { text: "Starts with: " + data.files.join(", ") }) : null),
      );
      if (yours.length > 1) {
        parts.push(el("div", { class: "grid", style: "margin-top:12px" }, yours.slice(1).map((t) =>
          el("div", { class: "card" }, el("h3", {}, t.name, el("span", { class: "tag", text: t.where })), t.why !== data.best.why ? el("p", { text: sentence(t.why) }) : null))));
      }
      if (data.reviewer) parts.push(el("div", { class: "section-title", text: "Second opinion from " + data.reviewer.name }), command(data.reviewer.command));
      if (data.notes.length) parts.push(el("div", { class: "section-title", text: "Notes" }), ...data.notes.map((n) => el("p", { class: "muted", text: n })));
      return parts;
    },
    handoff(data) {
      const parts = [el("div", { class: "ok", text: "Wrote HANDOFF.md: " + data.changes.length + " changed file(s), " + data.commits.length + " commit(s) on " + data.branch + "." })];
      if (data.next.best) parts.push(el("div", { class: "section-title", text: "Continue with " + data.next.best.name }), command(data.next.best.command));
      else parts.push(el("div", { class: "section-title", text: "No other AI tool is installed" }), el("p", { text: "Paste HANDOFF.md into ChatGPT or Gemini on the web and ask it to continue, or install Gemini CLI (free tier):" }), command("npm i -g @google/gemini-cli"));
      const copyNote = el("button", { class: "btn ghost", style: "margin-top:12px", text: "Copy HANDOFF.md", onclick: () => { copyText(data.note); copyNote.textContent = "Copied"; setTimeout(() => (copyNote.textContent = "Copy HANDOFF.md"), 1500); } });
      parts.push(copyNote);
      if (data.changes.length) parts.push(el("div", { class: "section-title", text: "Changed files in the note" }), el("table", {}, el("tr", {}, el("th", { text: "File" }), el("th", { text: "Change" })), data.changes.map((c) => el("tr", {}, el("td", { text: c.file }), el("td", { text: c.status + " (+" + c.added + " −" + c.removed + ")" })))));
      parts.push(el("p", { class: "muted", text: "HANDOFF.md is for the next AI only: don't commit it." }));
      return parts;
    },
    fix(data, applied) {
      if (!data.planned.length) return [el("div", { class: "ok", text: "Nothing to fix: your AI tools already skip the heavy files, or there are none." })];
      const parts = [el("table", {}, el("tr", {}, el("th", { text: "File" }), el("th", { text: "Added to" }), el("th", { text: "For" })), data.planned.map((p) => el("tr", {}, el("td", { text: p.file }), el("td", { text: p.target }), el("td", { text: p.tool }))))];
      if (applied) parts.unshift(el("div", { class: "ok", style: "margin-bottom:12px", text: data.changes.length ? "Done. Updated " + data.changes.map((c) => c.file).join(", ") + "." : "Already done: your AI tools skip these files." }));
      else parts.push(el("button", { class: "btn", style: "margin-top:14px", text: "Apply fix", onclick: () => load("fix", { apply: true }, true) }));
      return parts;
    },
    tokens: (data, _, text) => [el("pre", { class: "raw", text })],
    doctor: (data, _, text) => [el("pre", { class: "raw", text })],
    score(data) {
      const canvas = drawScoreCard(data);
      const download = el("a", { class: "btn", text: "Download image", download: "ai-setup-score.png", href: "#" });
      download.addEventListener("click", (event) => {
        // Webviews cannot download, so VS Code saves the image through the extension instead.
        if (vscodeApi) {
          event.preventDefault();
          vscodeApi.postMessage({ type: "save", name: "ai-setup-score.png", dataUrl: canvas.toDataURL("image/png") });
        } else download.setAttribute("href", canvas.toDataURL("image/png"));
      });
      const copy = el("button", { class: "btn ghost", text: "Copy text to share", onclick: () => { copyText(data.share); copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy text to share"), 1500); } });
      const parts = [canvas, el("div", { class: "form", style: "margin-top:14px" }, download, copy), el("p", { class: "muted", text: data.share })];
      if (data.items.length) {
        parts.push(el("div", { class: "section-title", text: "What costs points" }),
          el("table", { class: "points" }, data.items.map((i) => el("tr", {}, el("td", { text: String(i.points).replace("-", "−") }), el("td", {}, el("div", { text: i.label }), el("div", { class: "muted", text: "→ " + i.tip }))))));
      }
      return parts;
    },
    usage(data) {
      if (!data.found) return [el("div", { class: "ok", text: "No Claude Code logs on this laptop, so there is no usage to show." })];
      const n = (v) => "~" + v.toLocaleString("en-US");
      const stat = (label, bucket) => el("div", { class: "card" }, el("div", { class: "muted", text: label }), el("h3", { text: n(bucket.fresh) + " tokens" }), el("p", { text: bucket.replies + " replies · + " + n(bucket.cached) + " re-read from cache" }));
      const parts = [
        el("div", { class: "card best", style: "margin-bottom:14px" }, el("div", { class: "muted", text: "5-hour limit window (estimate)" }), el("p", { text: data.windowText })),
        el("div", { class: "grid" }, stat("Today", data.today), stat("Last 7 days", data.week)),
      ];
      if (data.projects.length) parts.push(el("div", { class: "section-title", text: "Busiest projects (7 days)" }), el("table", {}, data.projects.map((p) => el("tr", {}, el("td", { text: p.project }), el("td", { text: n(p.fresh) + " tokens" })))));
      if (data.tip) parts.push(el("div", { class: "consent", style: "margin-top:14px" }, el("strong", { text: "Tip" }), el("p", { text: data.tip })));
      return parts;
    },
    ai(data) {
      if (!data.answer) return [el("div", { class: "consent" }, el("strong", { text: data.fallback + ", so here is the rules answer." }))].concat(RENDER.task(data.rules));
      const a = data.answer;
      const parts = [el("p", { class: "muted", text: "Answer from " + data.runner.name + " (asked with no tools). Rules answer: " + data.rules.overall.name + " / " + data.rules.best.name + "." })];
      parts.push(el("div", { class: "section-title", text: "① Best AI for this task (any tool)" }),
        el("div", { class: "card best" },
          el("h3", {}, a.bestAnywhereName, el("span", { class: "tag " + (a.bestAnywhereInstalled ? "yes" : "no"), text: a.bestAnywhereInstalled ? "✓ On your laptop" : "✗ Not on your laptop" })),
          a.bestAnywhereInstalled ? el("p", { text: "You already have it: use the command below." })
            : el("p", {}, "Get it: ", el("a", { href: a.bestAnywhereHomepage, target: "_blank", rel: "noopener", text: a.bestAnywhereHomepage.replace("https://", "") }))));
      parts.push(el("div", { class: "section-title", text: "② Use on your laptop" }),
        el("div", { class: "card mine" },
          el("h3", {}, a.bestInstalledName, a.model ? el("span", { class: "tag", text: "model: " + a.model }) : null),
          el("p", { text: a.why }),
          command(data.command)));
      if (a.steps.length) parts.push(el("div", { class: "section-title", text: "Steps" }), el("ol", {}, a.steps.map((s) => el("li", { text: s }))));
      parts.push(el("div", { class: "section-title", text: "Better prompt" }), el("pre", { class: "raw", text: a.prompt }));
      return parts;
    },
    slim(data) {
      if (data.applied) return [el("div", { class: "ok", text: "Done. " + data.applied + " now uses the shorter version; the old one is in " + data.applied + ".bak." })];
      if (!data.target) return [el("div", { class: "ok", text: "No instructions file over 2,000 tokens, so there is nothing worth shortening." })];
      if (!data.written) return [el("div", { class: "consent" }, el("strong", { text: data.runner.name + " did not return a shorter file. Nothing was written." }))];
      return [
        el("div", { class: "grid" },
          el("div", { class: "card" }, el("div", { class: "muted", text: "Now" }), el("h3", { text: "~" + data.before.toLocaleString("en-US") + " tokens per message" })),
          el("div", { class: "card mine" }, el("div", { class: "muted", text: "Shorter copy (" + data.written + ")" }), el("h3", { text: "~" + data.after.toLocaleString("en-US") + " tokens per message" }))),
        el("p", { class: "muted", text: data.target.file + " is unchanged. Read the shorter copy below; use it only if it keeps everything you need." }),
        el("pre", { class: "raw", text: data.slim }),
        el("button", { class: "btn", style: "margin-top:14px", text: "Use the shorter version", onclick: () => load("slim", { apply: true }) }),
      ];
    },
  };

  // A short guide for first-time users. Static, so it works without asking the engine anything.
  function guide() {
    const inSidebar = Boolean(vscodeApi);
    const step = (title, text, cli) => el("div", { class: "card" }, el("h3", { text: title }), el("p", { text }), inSidebar ? null : command(cli));
    return [
      el("p", { class: "muted", style: "margin:0 0 12px", text: "which-ai-to-use looks at this project and the AI tools on this laptop. Nothing leaves your laptop unless you allow Ask my AI too." }),
      el("div", { class: "grid" },
        step("1. Check your project", "Checkup lists the files and add-ons your AI reads that cost tokens, and your setup score.", "npx which-ai-to-use"),
        step("2. Stop wasting tokens", "Fix tokens shows which heavy files your AI tools will skip. Nothing changes until you click Apply; your code is never touched.", "npx which-ai-to-use fix"),
        step("3. Starting a task?", "Pick an AI: describe the task to get the best AI and model, the files to start with, and a command to copy.", 'npx which-ai-to-use "add a coupon field to the cart"'),
        step("4. Claude's limit ran out?", "Limit over? writes HANDOFF.md, so Gemini CLI, Codex or a chat like ChatGPT carries on instead of starting over.", "npx which-ai-to-use handoff --copy"),
        step("5. Know when it resets", "Usage shows when your current 5-hour Claude window resets and how much you used today.", "npx which-ai-to-use usage"),
        step("6. Share your score", "Score card makes an image of your AI setup score to post.", "npx which-ai-to-use score --card"),
      ),
      el("p", { class: "muted", style: "margin:14px 0 0", text: inSidebar ? "Prefer the keyboard? Every action is also in the Command Palette: type Which AI." : "Everything here also works in the terminal, and in VS Code as the Which AI sidebar." }),
    ];
  }

  async function load(action, body = {}, applied = false) {
    const response = await call(action, body);
    if (!response) return;
    result.replaceChildren(...RENDER[action](response.data, applied, response.text));
    if (applied) refreshStats();
    if (window.matchMedia("(max-width: 980px)").matches) result.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // After a fix the summary numbers change, so fetch the checkup again without touching the open view.
  async function refreshStats() {
    try {
      updateStats((await request("checkup", {})).data);
    } catch {
      // The stats stay as they were; the open view already shows the result.
    }
  }

  function show(view) {
    document.querySelectorAll(".nav-btn").forEach((b) => b.setAttribute("aria-current", String(b.dataset.view === view)));
    $("view-title").textContent = VIEWS[view].title;
    $("view-sub").textContent = VIEWS[view].sub;
    $("form-task").classList.toggle("hidden", view !== "task");
    $("form-handoff").classList.toggle("hidden", view !== "handoff");
    $("form-slim").classList.toggle("hidden", view !== "slim");
    $("consent").classList.add("hidden");
    result.replaceChildren();
    status.textContent = "";
    if (view === "task") $("task").focus();
    else if (view === "handoff") $("handoff-task").focus();
    else if (view === "guide") result.replaceChildren(...guide());
    else if (view !== "slim") load(view);
  }

  // Nothing goes to an AI until the user has read what will be sent and clicked Allow.
  let onAllow = null;
  function askConsent(text, allow) {
    $("consent-text").textContent = text;
    $("consent").classList.remove("hidden");
    onAllow = allow;
  }
  $("consent-yes").addEventListener("click", () => { $("consent").classList.add("hidden"); if (onAllow) onAllow(); });
  $("consent-no").addEventListener("click", () => { $("consent").classList.add("hidden"); status.textContent = "Nothing was sent."; });

  let aiAllowed = false;
  async function ask() {
    const task = $("task").value;
    if (!$("use-ai").checked) return load("task", { task });
    if (aiAllowed) return load("ai", { task, consent: true });
    const preview = await call("ai", { task });
    if (!preview) return;
    result.replaceChildren(...RENDER.task(preview.data.rules));
    askConsent(preview.text, () => { aiAllowed = true; load("ai", { task, consent: true }); });
  }

  async function startSlim() {
    const preview = await call("slim");
    if (!preview) return;
    if (!preview.data.needsConsent) return result.replaceChildren(...RENDER.slim(preview.data));
    askConsent(preview.text, () => load("slim", { consent: true }));
  }

  document.querySelectorAll(".nav-btn").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));
  $("ask").addEventListener("click", ask);
  $("slim-start").addEventListener("click", startSlim);
  $("write-handoff").addEventListener("click", () => load("handoff", { task: $("handoff-task").value, without: $("without-claude").checked ? ["claude-code"] : [] }));
  $("task").addEventListener("keydown", (e) => e.key === "Enter" && $("ask").click());
  $("handoff-task").addEventListener("keydown", (e) => e.key === "Enter" && $("write-handoff").click());
  // "?view=score" (from "score --card") opens a view directly; anything unknown falls back to the checkup.
  const first = new URLSearchParams(location.search).get("view");
  const opening = Object.hasOwn(VIEWS, first) && first !== "task" && first !== "handoff" ? first : "checkup";
  show(opening);
  // The summary boxes come from the checkup, so fill them when another view opens first.
  if (opening !== "checkup") refreshStats();
</script>
</body>
</html>
`;
}
