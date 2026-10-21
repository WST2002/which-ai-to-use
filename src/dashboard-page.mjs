const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const LIGHT = `
    --bg: #f4f5fb; --panel: #ffffff; --panel-2: #f8f9fd; --fg: #11131c; --muted: #5b6178; --line: #e2e5ef;
    --accent: #4f46e5; --accent-soft: #eef0ff; --accent-fg: #ffffff; --good: #15803d; --good-soft: #e8f7ee;
    --warn: #b45309; --warn-soft: #fff4e5; --code: #0e1120; --code-fg: #e4e7f5; --shadow: 0 1px 2px rgba(17,19,28,.04), 0 8px 24px -12px rgba(17,19,28,.12);`;
const DARK = `
      --bg: #0a0c13; --panel: #121623; --panel-2: #171c2c; --fg: #e9ebf5; --muted: #99a0b9; --line: #252b3e;
      --accent: #8f88ff; --accent-soft: #1d1f3b; --accent-fg: #0a0c13; --good: #4ade80; --good-soft: #10261a;
      --warn: #fbbf24; --warn-soft: #2a2010; --code: #070910; --code-fg: #dfe3f1; --shadow: 0 8px 28px -14px rgba(0,0,0,.6);`;

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
  :root {${LIGHT}
  }
  @media (prefers-color-scheme: dark) {
    :root {${DARK}
    }
  }
  /* Inside VS Code the editor theme decides, not the system setting. */
  body.vscode-light {${LIGHT}
  }
  body.vscode-dark, body.vscode-high-contrast {${DARK}
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { background: var(--bg); color: var(--fg); font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
  button, input { font: inherit; }

  .top { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
    padding: 12px clamp(16px, 3vw, 40px); background: color-mix(in srgb, var(--panel) 88%, transparent);
    backdrop-filter: blur(10px); border-bottom: 1px solid var(--line); }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 17px; }
  .mark { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; color: #fff; font-size: 15px;
    background: linear-gradient(135deg, #6366f1, #06b6d4); }
  .pills { display: flex; gap: 8px; flex-wrap: wrap; margin-left: auto; }
  .pill { font-size: 12.5px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); background: var(--panel); }
  .pill.good { color: var(--good); border-color: color-mix(in srgb, var(--good) 40%, transparent); background: var(--good-soft); }

  .layout { display: grid; grid-template-columns: 290px minmax(0, 1fr); gap: clamp(16px, 2vw, 28px);
    padding: clamp(16px, 2.5vw, 32px) clamp(16px, 3vw, 40px); max-width: 1680px; margin: 0 auto; }
  /* Grid items default to min-width: auto, so a long command would stretch the whole column. */
  main { min-width: 0; }
  nav { position: sticky; top: 76px; align-self: start; display: flex; flex-direction: column; gap: 6px; }
  .nav-btn { display: flex; gap: 12px; align-items: flex-start; text-align: left; width: 100%; padding: 12px 14px; border-radius: 12px;
    border: 1px solid transparent; background: transparent; color: var(--fg); cursor: pointer; }
  .nav-btn:hover { background: var(--panel); border-color: var(--line); }
  .nav-btn[aria-current="true"] { background: var(--panel); border-color: var(--accent); box-shadow: var(--shadow); }
  .nav-btn .icon { font-size: 18px; line-height: 1.3; }
  .nav-btn strong { display: block; font-size: 14.5px; }
  .nav-btn small { display: block; color: var(--muted); font-size: 12.5px; }

  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
  canvas.scorecard { width: 100%; max-width: 900px; height: auto; border-radius: 14px; border: 1px solid var(--line); display: block; }
  .stat { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; box-shadow: var(--shadow); min-width: 0; }
  .stat .label { color: var(--muted); font-size: 12.5px; text-transform: uppercase; letter-spacing: .06em; }
  .stat .value { font-size: 26px; font-weight: 750; margin-top: 2px; }
  .stat .value.warn { color: var(--warn); }
  .stat .value.good { color: var(--good); }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
  .chip { font-size: 12.5px; padding: 2px 9px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); }

  .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; box-shadow: var(--shadow); overflow: hidden; }
  .panel-head { padding: 18px 20px 6px; }
  .panel-head h1 { font-size: 20px; margin: 0; }
  .panel-head p { margin: 4px 0 0; color: var(--muted); }
  .panel-body { padding: 14px 20px 20px; }
  .form { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
  .form input[type=text] { flex: 1 1 320px; min-width: 0; padding: 11px 13px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel-2); color: var(--fg); }
  .form input[type=text]:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  .check { display: flex; gap: 8px; align-items: center; color: var(--muted); font-size: 14px; }
  .btn { border: 0; border-radius: 10px; padding: 11px 16px; font-weight: 650; cursor: pointer; background: var(--accent); color: var(--accent-fg); }
  .btn.ghost { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
  .btn.small { padding: 6px 11px; font-size: 13px; }
  .btn:disabled { opacity: .55; cursor: progress; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
  .card { border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; background: var(--panel-2); min-width: 0; }
  .card.best { border-color: var(--accent); background: var(--accent-soft); grid-column: 1 / -1; }
  .card h3 { margin: 0; font-size: 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .card .tag { font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: var(--panel); color: var(--muted); border: 1px solid var(--line); }
  .card .tag.star { background: var(--accent); color: var(--accent-fg); border: 0; }
  .card .tag.yes { background: var(--good-soft); color: var(--good); border-color: color-mix(in srgb, var(--good) 40%, transparent); }
  .card .tag.no { background: var(--warn-soft); color: var(--warn); border-color: color-mix(in srgb, var(--warn) 40%, transparent); }
  .card.mine { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
  .consent { border: 1px solid color-mix(in srgb, var(--warn) 45%, var(--line)); background: var(--warn-soft); border-radius: 14px; padding: 14px 16px; margin-bottom: 14px; }
  .consent p { margin: 6px 0 12px; white-space: pre-line; }
  ol { margin: 0; padding-left: 22px; }
  .card p { margin: 6px 0 0; color: var(--muted); }
  .card a { color: var(--accent); }
  .section-title { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 20px 0 10px; }
  .issue { display: flex; gap: 14px; align-items: flex-start; }
  .issue .num { flex: none; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 13px; background: var(--warn-soft); color: var(--warn); }
  .issue .fix { color: var(--fg); margin-top: 4px; }
  .ok { padding: 14px 16px; border-radius: 12px; background: var(--good-soft); color: var(--good); font-weight: 600; }

  .cmd { display: flex; gap: 8px; align-items: stretch; margin-top: 10px; }
  .cmd code { flex: 1; min-width: 0; overflow-x: auto; white-space: pre; padding: 10px 12px; border-radius: 10px; background: var(--code); color: var(--code-fg); font: 13px/1.5 "Cascadia Code", Consolas, monospace; }
  pre.raw { margin: 0; padding: 16px; border-radius: 12px; background: var(--code); color: var(--code-fg); overflow: auto; white-space: pre-wrap; font: 13.5px/1.6 "Cascadia Code", Consolas, monospace; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--line); vertical-align: top; overflow-wrap: anywhere; }
  th { color: var(--muted); font-weight: 600; font-size: 12.5px; text-transform: uppercase; letter-spacing: .05em; }
  .status { min-height: 22px; font-size: 13.5px; color: var(--muted); margin-top: 12px; }
  .status.error { color: var(--warn); }
  .muted { color: var(--muted); }
  .hidden { display: none !important; }
  footer { text-align: center; color: var(--muted); font-size: 12.5px; padding: 6px 0 28px; }

  @media (min-width: 1500px) { .layout { grid-template-columns: 320px minmax(0, 1fr); } .stat .value { font-size: 30px; } }
  @media (max-width: 980px) {
    .layout { grid-template-columns: 1fr; }
    nav { position: sticky; top: 58px; z-index: 4; flex-direction: row; overflow-x: auto; gap: 8px; padding: 4px 2px 8px; margin: 0 -4px;
      background: var(--bg); scrollbar-width: none; }
    .nav-btn { flex: none; width: auto; padding: 8px 12px; border-color: var(--line); background: var(--panel); }
    .nav-btn small { display: none; }
    .nav-btn .icon { font-size: 15px; }
  }
  @media (max-width: 640px) {
    .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
    .stat { padding: 10px; }
    .stat .label { font-size: 10.5px; letter-spacing: .03em; }
    .stat .value { font-size: 20px; }
    .stat .chips, .stat .muted { display: none; }
    .pills .pill:not(.good) { display: none; }
    .panel-head, .panel-body { padding-left: 14px; padding-right: 14px; }
    .grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<header class="top">
  <div class="brand"><span class="mark" aria-hidden="true">✦</span>which-ai-to-use</div>
  <div class="pills">
    <span class="pill">Project: ${escapeHtml(project)}</span>
    ${version ? `<span class="pill">v${escapeHtml(version)}</span>` : ""}
    <span class="pill good">🔒 Runs only on this laptop</span>
  </div>
</header>

<div class="layout">
  <nav aria-label="Actions">
    <button class="nav-btn" data-view="checkup"><span class="icon">🩺</span><span><strong>Checkup</strong><small>What is wasting your tokens</small></span></button>
    <button class="nav-btn" data-view="task"><span class="icon">🧭</span><span><strong>Which AI for a task?</strong><small>Best tool and model, with the command</small></span></button>
    <button class="nav-btn" data-view="handoff"><span class="icon">🔁</span><span><strong>Claude limit over?</strong><small>Hand the task to another AI</small></span></button>
    <button class="nav-btn" data-view="fix"><span class="icon">🧹</span><span><strong>Fix wasted tokens</strong><small>Make your AI skip heavy files</small></span></button>
    <button class="nav-btn" data-view="tokens"><span class="icon">📊</span><span><strong>Token details</strong><small>Everything that is counted</small></span></button>
    <button class="nav-btn" data-view="score"><span class="icon">🏆</span><span><strong>Score card</strong><small>Your AI setup score, ready to share</small></span></button>
    <button class="nav-btn" data-view="usage"><span class="icon">📈</span><span><strong>Usage</strong><small>Limit reset time, tokens today and this week</small></span></button>
    <button class="nav-btn" data-view="slim"><span class="icon">✂️</span><span><strong>Shorten CLAUDE.md</strong><small>Ask your AI for a shorter version</small></span></button>
    <button class="nav-btn" data-view="doctor"><span class="icon">🧰</span><span><strong>Installed tools</strong><small>AI tools on this laptop</small></span></button>
  </nav>

  <main>
    <section class="stats" aria-label="Summary">
      <div class="stat"><div class="label">Your AI tools</div><div class="value" id="stat-tools">–</div><div class="chips" id="stat-tool-chips"></div></div>
      <div class="stat"><div class="label">Tokens at risk</div><div class="value" id="stat-tokens">–</div><div class="muted" id="stat-tokens-note"></div></div>
      <div class="stat"><div class="label">Add-ons switched on</div><div class="value" id="stat-addons">–</div><div class="muted" id="stat-addons-note"></div></div>
      <div class="stat"><div class="label">Setup score</div><div class="value" id="stat-score">–</div><div class="muted" id="stat-score-note"></div></div>
    </section>

    <section class="panel" aria-live="polite">
      <div class="panel-head"><h1 id="view-title">Checkup</h1><p id="view-sub"></p></div>
      <div class="panel-body">
        <div class="form hidden" id="form-task">
          <input type="text" id="task" placeholder="Describe the task, e.g. make the hero section look better" aria-label="Task">
          <label class="check"><input type="checkbox" id="use-ai"> 🤖 Ask my AI too</label>
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
    const bg = c.createLinearGradient(0, 0, 1200, 630);
    bg.addColorStop(0, "#0b1020");
    bg.addColorStop(1, "#1b1446");
    c.fillStyle = bg;
    c.fillRect(0, 0, 1200, 630);
    const glow = c.createRadialGradient(950, 120, 10, 950, 120, 420);
    glow.addColorStop(0, "rgba(99,102,241,.45)");
    glow.addColorStop(1, "rgba(99,102,241,0)");
    c.fillStyle = glow;
    c.fillRect(0, 0, 1200, 630);

    c.fillStyle = "#a5b4fc";
    c.font = font(26, 700);
    c.fillText("✦ which-ai-to-use", 70, 90);
    c.fillStyle = "#e9ebf5";
    c.font = font(54, 800);
    c.fillText("My AI setup score", 70, 175);
    c.fillStyle = "#9aa1b9";
    c.font = font(28, 500);
    c.fillText("Project: " + data.project, 70, 222);

    const good = data.score >= 75;
    const color = good ? "#4ade80" : data.score >= 60 ? "#fbbf24" : "#f87171";
    c.lineWidth = 22;
    c.strokeStyle = "rgba(255,255,255,.12)";
    c.beginPath(); c.arc(930, 330, 150, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = color;
    c.lineCap = "round";
    c.beginPath(); c.arc(930, 330, 150, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * data.score) / 100); c.stroke();
    c.fillStyle = "#ffffff";
    c.textAlign = "center";
    c.font = font(96, 800);
    c.fillText(String(data.score), 930, 350);
    c.fillStyle = "#9aa1b9";
    c.font = font(26, 600);
    c.fillText("out of 100", 930, 395);
    c.fillStyle = color;
    c.font = font(36, 800);
    c.fillText("Grade " + data.grade, 930, 545);
    c.textAlign = "left";

    c.font = font(29, 600);
    let y = 300;
    const lines = data.items.length ? data.items.slice(0, 5).map((i) => "✗  " + i.short) : ["✓  Lean, well-described project"];
    for (const line of lines) {
      c.fillStyle = data.items.length ? "#fca5a5" : "#86efac";
      c.fillText(line, 70, y);
      y += 46;
    }
    if (data.saving) {
      c.fillStyle = "#e9ebf5";
      c.font = font(29, 700);
      c.fillText("Fixing it saves ~" + data.saving.toLocaleString("en-US") + " tokens", 70, 545);
    }
    c.fillStyle = "#a5b4fc";
    c.font = font(24, 600);
    c.fillText("Check yours: npx which-ai-to-use score", 70, 590);
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
                el("div", { class: "fix", text: "→ " + issue.fix.replace("npx which-ai-to-use fix", "click Fix wasted tokens") }),
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
          el("h3", {}, data.best.name, el("span", { class: "tag star", text: "★ Best of yours" }), el("span", { class: "tag", text: data.best.where })),
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
          el("table", {}, data.items.map((i) => el("tr", {}, el("td", { text: String(i.points).replace("-", "−") }), el("td", {}, el("div", { text: i.label }), el("div", { class: "muted", text: "→ " + i.tip }))))));
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
      const parts = [el("p", { class: "muted", text: "🤖 Answer from " + data.runner.name + " (asked with no tools). Rules answer: " + data.rules.overall.name + " / " + data.rules.best.name + "." })];
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
  show(Object.hasOwn(VIEWS, first) && first !== "task" && first !== "handoff" ? first : "checkup");
</script>
</body>
</html>
`;
}
