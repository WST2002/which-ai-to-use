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
  report: '<rect x="2.5" y="3" width="11" height="10.5" rx="1"/><path d="M2.5 6h11M5.5 9.5v1.5M8 8.5V11M10.5 9v2"/>',
  slim: '<path d="M3 4.5h10M3 8h7M3 11.5h4"/>',
  doctor: '<rect x="2.5" y="3" width="11" height="8" rx="1"/><path d="M5.5 13.5h5"/>',
  guide: '<circle cx="8" cy="8" r="6"/><path d="M6.4 6.3a1.7 1.7 0 0 1 3.2.6c0 1.1-1.6 1.4-1.6 2.4M8 11.3v.1"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  expand: '<path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9"/>',
  layers: '<path d="M8 2.5 14 5.5 8 8.5 2 5.5z"/><path d="M2 8.5l6 3 6-3M2 11l6 3 6-3"/>',
  file: '<path d="M9.5 2H4.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V5z"/><path d="M9.5 2v3h3"/>',
  puzzle: '<path d="M6 3.5a1.5 1.5 0 0 1 3 0V5h3v3h-1.5a1.5 1.5 0 0 0 0 3H12v2.5H3V11h1.5a1.5 1.5 0 0 0 0-3H3V5h3z"/>',
  trophy: '<path d="M5 2.5h6v4a3 3 0 0 1-6 0zM5 4H2.5a2.5 2.5 0 0 0 2.6 3M11 4h2.5a2.5 2.5 0 0 1-2.6 3M8 9.5V12M5.5 13.5h5"/>',
  send: '<path d="M14 2 7 9M14 2 9.5 14 7 9 2 6.5z"/>',
  copy: '<rect x="5.5" y="5.5" width="8" height="8" rx="1"/><path d="M10.5 5.5V3.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>',
  download: '<path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10"/>',
  external: '<path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/>',
  info: '<circle cx="8" cy="8" r="6"/><path d="M8 7.3v3.5M8 5.2v.1"/>',
  chevron: '<path d="M6 3.5 10.5 8 6 12.5"/>',
  warn: '<path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3M8 11.2v.1"/>',
  retry: '<path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v3h-3"/>',
};
// Pieces of markup the script builds from: our own icons, never anything from the server.
const ICONS_FOR_SCRIPT = ["copy", "send", "external", "download", "info", "warn", "retry", "fix", "usage"];
const icon = (name) => `<svg class="i" viewBox="0 0 16 16" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
const NAV = [
  ["checkup", "Checkup", "What is wasting your tokens"],
  ["task", "Which AI for a task?", "Best tool and model, with the command"],
  ["handoff", "Claude limit over?", "Hand the task to another AI"],
  ["fix", "Fix wasted tokens", "Make your AI skip heavy files"],
  ["tokens", "Token details", "Everything that is counted"],
  ["score", "Score card", "Your AI setup score, ready to share"],
  ["usage", "Usage", "Limit reset time, tokens today and this week"],
  ["report", "Your AI week", "This week vs last week, ready to share"],
  ["slim", "Shorten CLAUDE.md", "Ask your AI for a shorter version"],
  ["doctor", "Installed tools", "AI tools on this laptop"],
  ["guide", "How to use", "Six steps to get started"],
];

/**
 * The single dashboard page. Every value from the server is inserted with textContent, never as HTML.
 * `bridge`: "http" talks to the local server; "vscode" talks to the extension through postMessage.
 * `surface`: "browser", "sidebar" (the narrow VS Code view) or "panel" (the full view in a VS Code editor tab).
 */
export function dashboardPage({ token, project, version, bridge = "http", nonce = "", surface = bridge === "vscode" ? "sidebar" : "browser" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${bridge === "vscode" ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">` : ""}
<title>which-ai-to-use — ${escapeHtml(project)}</title>
<style>
  :root {${bridge === "vscode" ? VSCODE : LIGHT}${surface === "panel" ? "\n    --bg: var(--vscode-editor-background, var(--vscode-sideBar-background)); --panel: var(--vscode-editor-background, var(--vscode-sideBar-background));" : ""}
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
  .mark { width: 22px; height: 22px; border-radius: 6px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); display: grid; place-items: center; flex: none; }
  .mark svg { width: 15px; height: 15px; fill: #fff; }
  .brand .project { color: var(--muted); font-weight: 400; }
  .meta { margin-left: auto; display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12.5px; white-space: nowrap; }
  .meta svg.i { width: 14px; height: 14px; color: var(--good); }

  .layout { display: grid; grid-template-columns: 232px minmax(0, 1fr); gap: 24px; padding: 24px clamp(16px, 3vw, 32px); max-width: 1400px; margin: 0 auto; }
  /* Grid items default to min-width: auto, so a long command would stretch the whole column. */
  main { min-width: 0; }
  nav { position: sticky; top: 76px; align-self: start; display: flex; flex-direction: column; gap: 2px; }
  .nav-btn { display: flex; gap: 12px; align-items: flex-start; width: 100%; min-width: 0; padding: 9px 12px; border-radius: 8px;
    border: 0; border-left: 3px solid transparent; background: transparent; color: var(--fg); text-align: left; cursor: pointer; }
  .nav-btn svg.i { width: 18px; height: 18px; margin-top: 1px; color: var(--muted); }
  .nav-btn strong { display: block; font-size: 14px; font-weight: 600; }
  .nav-btn small { display: block; color: var(--muted); font-size: 12px; }
  .nav-btn[aria-current="true"] svg.i { color: inherit; }
  .nav-btn[aria-current="true"] small { color: inherit; opacity: .8; }
  .nav-btn:hover { background: var(--hover); color: var(--fg); }
  .nav-btn[aria-current="true"] { background: var(--selected-bg); color: var(--selected-fg); border-left-color: var(--accent); }
  .nav-btn:focus-visible, .btn:focus-visible, input:focus-visible { outline: 1px solid var(--focus); outline-offset: 1px; }

  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
  /* Each summary box opens the view with its details. */
  .stat { display: flex; gap: 12px; align-items: flex-start; text-align: left; width: 100%; background: var(--panel); border: 1px solid var(--line);
    border-radius: 10px; padding: 14px; min-width: 0; color: var(--fg); cursor: pointer; }
  .stat:hover { border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
  .stat:hover .go { color: var(--fg); }
  .stat-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .stat-text > span { display: block; }
  .stat-text > .chips { display: flex; }
  .stat .go { color: var(--muted); margin-top: 2px; }
  .stat-icon { width: 40px; height: 40px; border-radius: 10px; flex: none; display: grid; place-items: center; }
  .stat-icon svg.i { width: 20px; height: 20px; }
  .stat-icon.blue { color: #60a5fa; background: rgba(59, 130, 246, .16); }
  .stat-icon.orange { color: #fb923c; background: rgba(249, 115, 22, .16); }
  .stat-icon.purple { color: #c084fc; background: rgba(168, 85, 247, .16); }
  .stat-icon.green { color: #4ade80; background: rgba(34, 197, 94, .16); }
  .stat .label { color: var(--muted); font-size: 12.5px; }
  .stat .value { font-size: 26px; font-weight: 700; letter-spacing: -.02em; line-height: 1.2; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .stat .value.warn { color: var(--warn); }
  .stat .value.good { color: var(--good); }
  .stat .muted { font-size: 12px; overflow: hidden; text-overflow: ellipsis; }
  .chips { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
  .chip { white-space: nowrap; font-size: 12px; padding: 1px 7px; border-radius: 4px; background: var(--panel-2); border: 1px solid var(--line); color: var(--muted); }
  canvas.scorecard { width: 100%; max-width: 760px; height: auto; border-radius: var(--radius-lg); border: 1px solid var(--line); display: block; }

  .panel { background: transparent; }
  .panel-head { padding: 4px 0 14px; }
  .panel-head h1 { font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -.02em; line-height: 1.25; }
  .panel-head p { margin: 4px 0 0; color: var(--muted); font-size: 13.5px; }
  .panel-body { padding: 0; }
  .form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
  .recent { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin: -4px 0 14px; font-size: 12px; }
  .chip-btn { display: inline-flex; gap: 5px; align-items: center; max-width: 100%; font: inherit; font-size: 12px; padding: 3px 10px; border-radius: 999px;
    border: 1px solid var(--line); background: var(--panel-2); color: var(--fg); cursor: pointer; }
  .chip-btn:hover { border-color: var(--link); }
  .chip-btn span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px; }
  .form input[type=text] { flex: 1 1 260px; min-width: 0; height: 42px; padding: 0 14px; border: 1px solid var(--input-border); border-radius: 8px;
    background: var(--input-bg); color: var(--input-fg); font-size: 14px; }
  .check { display: flex; gap: 8px; align-items: center; color: var(--muted); font-size: 13.5px; }
  .check input { width: 16px; height: 16px; accent-color: var(--accent); }
  .btn.big { height: 42px; padding: 0 20px; font-size: 14px; border-radius: 8px; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 12px; border: 1px solid transparent;
    border-radius: var(--radius); font-weight: 500; font-size: 13px; cursor: pointer; background: var(--accent); color: var(--accent-fg); text-decoration: none; white-space: nowrap; }
  .btn:hover { background: var(--accent-hover); }
  .btn.ghost { background: var(--btn2-bg); color: var(--btn2-fg); border-color: var(--line); }
  .btn.ghost:hover { background: var(--hover); }
  .btn.small { height: 26px; padding: 0 10px; font-size: 12px; }
  .bars { display: grid; grid-template-columns: 3em 1fr 4em; gap: 6px 10px; align-items: center; margin: 4px 0 14px; font-variant-numeric: tabular-nums; }
  .bars .bar { height: 10px; border-radius: 3px; background: var(--accent); min-width: 2px; }
  .bars .num { text-align: right; color: var(--muted); }
  table.points td:first-child { width: 56px; white-space: nowrap; color: var(--warn); font-variant-numeric: tabular-nums; }
  .btn:disabled { opacity: .5; cursor: progress; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
  .list { display: flex; flex-direction: column; gap: 8px; max-width: 760px; }
  .card { border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; background: var(--panel); min-width: 0; }
  .card.best { border-color: var(--accent); grid-column: 1 / -1; }
  .card h3 { margin: 0; font-size: 16px; font-weight: 600; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .card .tag { font-size: 12px; font-weight: 500; padding: 2px 8px; border-radius: 6px; background: var(--panel-2); color: var(--muted); border: 1px solid var(--line); }
  .card .tag.star { background: var(--accent); color: var(--accent-fg); border-color: transparent; }
  .card .tag.yes { color: var(--good); border-color: color-mix(in srgb, var(--good) 45%, transparent); background: transparent; }
  .card .tag.no { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 45%, transparent); background: var(--warn-soft); }
  /* An AI tool: its letter tile, what to do, and the button for it on the right. */
  .tool { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 4px 14px; align-items: start; }
  .tool > .tool-body { min-width: 0; }
  .tool > .tool-action { align-self: start; }
  .avatar { width: 36px; height: 36px; border-radius: 9px; display: grid; place-items: center; font-weight: 700; font-size: 15px; color: #fff; }
  .card.tool.best { background: color-mix(in srgb, var(--accent) 7%, var(--panel)); }
  .card.mine { border-color: color-mix(in srgb, var(--accent) 50%, var(--line)); }
  .consent { border: 1px solid color-mix(in srgb, var(--warn) 50%, var(--line)); background: var(--warn-soft); border-radius: var(--radius-lg); padding: 12px 14px; margin-bottom: 14px; }
  .consent p { margin: 6px 0 12px; white-space: pre-line; }
  ol { margin: 0; padding-left: 20px; }
  ol.steps { list-style: none; padding: 0; counter-reset: step; display: flex; flex-direction: column; gap: 8px; }
  ol.steps li { counter-increment: step; display: flex; gap: 10px; align-items: flex-start; }
  ol.steps li::before { content: counter(step); flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 12px;
    font-weight: 600; border: 1px solid var(--line); background: var(--panel-2); color: var(--fg); margin-top: -1px; }
  /* A notice: an icon tile, a plain heading, the reason in muted text, and an optional button. */
  .alert { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel);
    margin-bottom: 14px; }
  .alert .alert-icon { width: 32px; height: 32px; border-radius: 8px; flex: none; display: grid; place-items: center; color: var(--warn); background: var(--warn-soft); }
  .alert.info .alert-icon { color: var(--link); background: color-mix(in srgb, var(--accent) 12%, transparent); }
  .alert .alert-body { flex: 1; min-width: 0; }
  .alert strong { display: block; font-weight: 600; }
  .alert p { margin: 2px 0 0; color: var(--muted); }
  .alert .btn { flex: none; align-self: center; }
  .ok.wrote { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
  .ok.wrote .btn { font-weight: 500; }
  details.preview { margin: 10px 0 0; }
  details.preview summary { cursor: pointer; color: var(--link); font-size: 13px; padding: 4px 0; }
  details.preview pre { margin-top: 8px; max-height: 360px; }
  .note { display: flex; gap: 8px; align-items: flex-start; color: var(--muted); font-size: 13px; margin: 0 0 14px; }
  .note svg.i { margin-top: 2px; }
  .card p { margin: 4px 0 0; color: var(--muted); }
  .card a { color: var(--link); }
  /* Section headings: bold and in the text colour, so each block of an answer stands apart from its text. */
  .section-title { font-size: 14.5px; font-weight: 650; color: var(--fg); margin: 22px 0 10px; letter-spacing: -.005em; }
  .card .section-title { margin: 16px 0 8px; font-size: 13.5px; }
  .eyebrow { font-size: 12.5px; color: var(--muted); margin-bottom: 2px; }
  .card h3.big { font-size: 18px; letter-spacing: -.01em; margin-top: 2px; }
  .issue { display: flex; gap: 10px; align-items: flex-start; }
  .issue .num { flex: none; width: 20px; height: 20px; border-radius: 4px; display: grid; place-items: center; font-weight: 600; font-size: 12px;
    background: var(--warn-soft); color: var(--warn); margin-top: 1px; }
  .issue .fix { color: var(--fg); margin-top: 4px; font-size: 13px; }
  .ok { padding: 10px 12px; border-radius: var(--radius); background: var(--good-soft); color: var(--good); font-weight: 500;
    border: 1px solid color-mix(in srgb, var(--good) 30%, transparent); }

  /* Commands wrap instead of scrolling sideways, with Copy next to them. */
  .cmd { display: flex; gap: 8px; align-items: flex-start; margin-top: 10px; padding: 10px 10px 10px 14px; border-radius: 8px; background: var(--code);
    border: 1px solid var(--line); }
  /* VS Code gives code its own box; inside a command it sits flat on the command box. */
  .cmd code { flex: 1; min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--code-fg); font: 12.5px/1.6 var(--mono); padding: 3px 0 0;
    background: transparent; border-radius: 0; }
  .cmd .btn { flex: none; }
  pre.raw { margin: 0; padding: 12px 14px; border-radius: var(--radius); background: var(--code); color: var(--code-fg); border: 1px solid var(--line);
    overflow: auto; white-space: pre-wrap; font: 12.5px/1.6 var(--mono); }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 7px 8px; border-bottom: 1px solid var(--line); vertical-align: top; overflow-wrap: anywhere; }
  th { color: var(--muted); font-weight: 500; font-size: 12px; }
  .status { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted); margin-top: 12px; }
  .status:empty { display: none; }
  .status.error { color: var(--warn); }
  /* While an answer is on its way: a spinner and what is happening, above the old answer so it is seen. */
  .status.busy { margin: 0 0 14px; padding: 10px 12px; border-radius: var(--radius-lg); color: var(--fg);
    background: color-mix(in srgb, var(--accent) 10%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--line)); }
  .spinner { width: 16px; height: 16px; flex: none; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--accent) 25%, transparent);
    border-top-color: var(--accent); animation: spin .8s linear infinite; }
  .status .elapsed { margin-left: auto; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2.4s; } }
  .muted { color: var(--muted); }
  .hidden { display: none !important; }
  footer { text-align: center; color: var(--muted); font-size: 12px; padding: 4px 16px 24px; }
  footer a { color: inherit; }

  /* In the sidebar the header wraps: logo and project, then "Runs only on this laptop" and Full view. */
  body.surface-sidebar .top { position: static; height: auto; flex-wrap: wrap; row-gap: 6px; padding: 10px 12px; }
  body.surface-sidebar .meta { margin-left: 0; }
  body.surface-sidebar .meta .long { display: inline; }
  body.surface-sidebar #open-full { margin-left: auto; }
  .tip { display: flex; gap: 8px; align-items: flex-start; margin: 8px 10px 0; padding: 8px 10px; border-radius: var(--radius); font-size: 12px;
    color: var(--muted); background: var(--panel-2); border: 1px solid var(--line); }
  .tip strong { color: var(--fg); font-weight: 600; }
  .tip button { margin-left: auto; border: 0; background: transparent; color: var(--muted); cursor: pointer; font-size: 15px; line-height: 1; padding: 0 2px; }
  /* In the sidebar the content sits straight on the background, with no card inside a card. */
  body.surface-sidebar .layout { padding: 10px; }

  /* Narrow: a phone or a VS Code sidebar. The same menu becomes a list above the content, never a sideways strip. */
  @media (max-width: 900px) {
    .layout { grid-template-columns: 1fr; gap: 12px; padding: 12px; }
    /* Two columns of short labels, so the answer is close to the top instead of below eleven rows. */
    nav { position: static; display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 2px;
      border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 4px; background: var(--panel); }
    .nav-btn { padding: 6px 8px; gap: 8px; align-items: center; }
    .nav-btn svg.i { margin-top: 0; }
    .nav-btn strong { font-size: 12.5px; line-height: 1.3; }
    .nav-btn small { display: none; }
    .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
    .stat { padding: 10px 12px; }
    .stat .value { font-size: 18px; }
    .stat .chips, .stat .muted { display: none; }
    .panel-head h1 { font-size: 20px; }
    .grid { grid-template-columns: 1fr; }
    .meta .long { display: none; }
  }
  /* Narrow (a VS Code sidebar): summary boxes stack their icon above the numbers, AI cards put their button and
     commands under the name, and Copy goes below a command, so nothing is squeezed into a thin column. */
  @media (max-width: 560px) {
    .stat { flex-direction: column; gap: 8px; position: relative; padding: 12px; }
    .stat-icon { width: 30px; height: 30px; border-radius: 8px; }
    .stat-icon svg.i { width: 16px; height: 16px; }
    .stat .go { position: absolute; top: 12px; right: 10px; }
    .tool { display: block; position: relative; }
    .tool > .avatar { position: absolute; top: 14px; left: 16px; width: 30px; height: 30px; border-radius: 8px; font-size: 13px; }
    .tool > .tool-body > h3 { min-height: 30px; padding-left: 40px; }
    .tool > .tool-action { margin-top: 10px; }
    .cmd { flex-wrap: wrap; padding: 10px 12px; }
    .cmd code { flex-basis: 100%; }
    .cmd .btn { margin-left: auto; }
  }
  @media (max-width: 420px) {
    .top { height: 44px; padding: 0 12px; }
    .layout { padding: 10px; }
    .form input[type=text] { flex-basis: 100%; }
  }
</style>
</head>
<body class="surface-${surface}">
<header class="top">
  <div class="brand"><span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2.5l2.2 5.3 5.3 2.2-5.3 2.2L12 17.5l-2.2-5.3L4.5 10l5.3-2.2z"/><path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/></svg></span>which-ai-to-use<span class="project">/ ${escapeHtml(project)}</span></div>
  <div class="meta">${icon("lock")}<span class="long">Runs only on this laptop</span>${version ? `<span>· v${escapeHtml(version)}</span>` : ""}</div>
  ${surface === "sidebar" ? `<button class="btn ghost small" id="open-full" title="Open the full dashboard in an editor tab">${icon("expand")}<span>Full view</span></button>` : ""}
</header>
${surface === "sidebar" ? `<p class="tip hidden" id="width-tip"><span>Looks cramped? Drag the sidebar's edge to make it wider, or click <strong>Full view</strong>.</span><button id="tip-close" aria-label="Hide this tip">×</button></p>` : ""}

<div class="layout">
  <nav aria-label="Actions">
${NAV.map(([view, label, hint]) => `    <button class="nav-btn" data-view="${view}" title="${hint}">${icon(view)}<span><strong>${label}</strong><small>${hint}</small></span></button>`).join("\n")}
  </nav>

  <main>
    <section class="stats" aria-label="Summary">
      <button class="stat" data-go="doctor" title="Installed tools"><span class="stat-icon blue">${icon("layers")}</span><span class="stat-text"><span class="label">Your AI tools</span><span class="value" id="stat-tools">–</span><span class="chips" id="stat-tool-chips"></span></span><span class="go">${icon("chevron")}</span></button>
      <button class="stat" data-go="tokens" title="Token details"><span class="stat-icon orange">${icon("file")}</span><span class="stat-text"><span class="label">Tokens at risk</span><span class="value" id="stat-tokens">–</span><span class="muted" id="stat-tokens-note"></span></span><span class="go">${icon("chevron")}</span></button>
      <button class="stat" data-go="tokens" title="Token details"><span class="stat-icon purple">${icon("puzzle")}</span><span class="stat-text"><span class="label">Add-ons on</span><span class="value" id="stat-addons">–</span><span class="muted" id="stat-addons-note"></span></span><span class="go">${icon("chevron")}</span></button>
      <button class="stat" data-go="score" title="Score card"><span class="stat-icon green">${icon("trophy")}</span><span class="stat-text"><span class="label">Setup score</span><span class="value" id="stat-score">–</span><span class="muted" id="stat-score-note"></span></span><span class="go">${icon("chevron")}</span></button>
    </section>

    <section class="panel" aria-live="polite">
      <div class="panel-head"><h1 id="view-title">Checkup</h1><p id="view-sub"></p></div>
      <div class="panel-body">
        <div class="form hidden" id="form-task">
          <input type="text" id="task" placeholder="Describe the task, e.g. make the hero section look better" aria-label="Task">
          <label class="check"><input type="checkbox" id="use-ai"> Ask my AI too</label>
          <button class="btn big" id="ask">${icon("send")}<span>Ask</span></button>
        </div>
        <div class="recent hidden" id="recent" aria-label="Tasks asked before"></div>
        <div class="form hidden" id="form-slim">
          <button class="btn" id="slim-start">Ask my AI to shorten it</button>
        </div>
        <div class="consent hidden" id="consent" role="dialog" aria-labelledby="consent-title">
          <strong id="consent-title">Allow this?</strong>
          <p id="consent-text"></p>
          <div class="form" style="margin:0"><button class="btn" id="consent-yes">Allow and ask</button><button class="btn ghost" id="consent-no">Cancel</button></div>
        </div>
        <div class="form hidden" id="form-handoff">
          <input type="text" id="handoff-task" placeholder="What were you working on? (optional: read from your AI's chat)" aria-label="Task to hand off">
          <label class="check"><input type="checkbox" id="without-claude" checked> Leave out Claude Code</label>
          <button class="btn big" id="write-handoff">${icon("send")}<span>Write HANDOFF.md</span></button>
        </div>
        <div class="status" id="status" role="status"></div>
        <div id="result"></div>
        <div class="status" id="updated"></div>
      </div>
    </section>
  </main>
</div>
<footer>Made by <a href="https://www.linkedin.com/in/wst2002/" target="_blank" rel="noopener">Wageesha Tripathi</a> · <a href="https://github.com/WST2002/which-ai-to-use" target="_blank" rel="noopener">GitHub</a></footer>

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
        // A reply that never comes (VS Code reloaded the extension, say) must not leave the page waiting forever.
        const timer = setTimeout(() => pending.delete(id) && reject(new Error("No answer from VS Code after 3 minutes. Click the view again to retry.")), 180000);
        pending.set(id, (reply) => {
          clearTimeout(timer);
          return reply.error ? reject(new Error(reply.error)) : resolve(reply.data);
        });
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
    report: { title: "Your AI week", sub: "The last 7 days next to the week before, from your AIs' own logs on this laptop: numbers only." },
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
  // A capital first letter and one full stop, even when the text already ends with one.
  const sentence = (s) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[.!?]?$/, (end) => end || ".");

  // Our own icons (fixed markup in this page, never text from the server).
  const ICON_SVG = ${JSON.stringify(Object.fromEntries(ICONS_FOR_SCRIPT.map((name) => [name, icon(name)])))};
  function svg(name) {
    const holder = document.createElement("template");
    holder.innerHTML = ICON_SVG[name];
    return holder.content.firstChild;
  }
  function copyButton(text, label = "Copy") {
    const words = el("span", { text: label });
    const button = el("button", { class: "btn ghost small", onclick: () => { copyText(text); words.textContent = "Copied"; setTimeout(() => (words.textContent = label), 1500); } }, svg("copy"), words);
    return button;
  }
  function command(text) {
    return el("div", { class: "cmd" }, el("code", { text }), copyButton(text));
  }
  function alertBox({ title, text, tone = "warn", action = null, more = [] }) {
    return el("div", { class: "alert " + tone, role: "status" },
      el("span", { class: "alert-icon" }, svg(tone === "warn" ? "warn" : "info")),
      el("div", { class: "alert-body" }, el("strong", { text: title }), text ? el("p", { text }) : null, ...more),
      action);
  }
  const note = (text) => el("p", { class: "note" }, svg("info"), el("span", { text }));

  // Each AI gets a letter tile in its own colour (not its logo).
  const TOOL_COLORS = { "claude-code": "#d97757", codex: "#10a37f", "gemini-cli": "#3b82f6", copilot: "#8957e5", cursor: "#52525b", windsurf: "#0f9d8a", aider: "#14b8a6", ollama: "#64748b", web: "#0ea5e9", other: "#71717a" };
  const avatar = (id, name) => el("span", { class: "avatar", style: "background:" + (TOOL_COLORS[id] ?? "#2563eb"), "aria-hidden": "true", text: name.charAt(0).toUpperCase() });
  function toolCard({ id, name, tags = [], best = false, body = [], action = null }) {
    return el("div", { class: "card tool" + (best ? " best" : "") },
      avatar(id, name),
      el("div", { class: "tool-body" }, el("h3", {}, name, ...tags), ...body),
      action ? el("div", { class: "tool-action" }, action) : el("span"));
  }
  // VS Code only: starts that AI in a terminal; the extension accepts only an id from its last answer.
  const runButton = (id, label = "Run in terminal") => vscodeApi
    ? el("button", { class: "btn", onclick: () => vscodeApi.postMessage({ type: "runInTerminal", choice: id }) }, svg("send"), el("span", { text: label }))
    : null;
  const getButton = (href, label) => el("a", { class: "btn ghost", href, target: "_blank", rel: "noopener" }, svg("external"), el("span", { text: label }));

  // What the user sees while an answer is on its way; asking an AI can take up to two minutes.
  const WAITING = {
    ai: "Asking your AI. This can take up to 2 minutes.",
    slim: "Asking your AI for a shorter copy. This can take up to 2 minutes.",
    handoff: "Reading your chat and writing HANDOFF.md…",
  };
  let ticking = null;
  function busy(action) {
    const elapsed = el("span", { class: "elapsed" });
    const started = Date.now();
    status.className = "status busy";
    status.replaceChildren(el("span", { class: "spinner", "aria-hidden": "true" }), el("span", { text: WAITING[action] ?? "Working…" }), elapsed);
    clearInterval(ticking);
    ticking = setInterval(() => {
      const seconds = Math.round((Date.now() - started) / 1000);
      if (seconds >= 3) elapsed.textContent = seconds + " s";
    }, 1000);
  }
  function idle(text = "", error = false) {
    clearInterval(ticking);
    status.className = "status" + (error ? " error" : "");
    status.textContent = text;
  }

  async function call(action, body = {}) {
    document.querySelectorAll("button").forEach((b) => (b.disabled = true));
    busy(action);
    $("updated").textContent = "";
    try {
      const data = await request(action, body);
      idle();
      $("updated").textContent = "Updated " + new Date().toLocaleTimeString();
      return data;
    } catch (error) {
      idle(error.message, true);
      return null;
    } finally {
      document.querySelectorAll("button").forEach((b) => (b.disabled = false));
    }
  }

  let toolsFound = null;
  function updateStats(data) {
    toolsFound = data.installed.length;
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

    // The logo: the sparkle on a blue tile, as in the header.
    c.fillStyle = "#2563eb";
    c.beginPath(); c.roundRect(66, 58, 34, 34, 8); c.fill();
    c.save();
    c.translate(70, 62);
    c.fillStyle = "#ffffff";
    c.fill(new Path2D("M12 2.5l2.2 5.3 5.3 2.2-5.3 2.2L12 17.5l-2.2-5.3L4.5 10l5.3-2.2z M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"));
    c.restore();
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

  // The fix for each checkup issue, right under it: heavy files are skipped in one click, the rest open their tool.
  function issueActions(issue, data) {
    if (issue.kind === "heavy-files") {
      const files = data.heavy.map((h) => h.file);
      return [
        el("details", { class: "preview" }, el("summary", { text: "Files your AI tools will skip (" + files.length + ")" }), el("ul", {}, files.map((file) => el("li", {}, el("code", { text: file }))))),
        el("button", { class: "btn small", style: "margin-top:10px", onclick: () => fixNow(data.score.score) }, svg("fix"), el("span", { text: "Fix it now" })),
      ];
    }
    if (issue.kind === "instructions") return [el("button", { class: "btn ghost small", style: "margin-top:10px", text: "Shorten it with my AI", onclick: () => show("slim") })];
    if (issue.kind === "add-ons") {
      const claude = data.mcp.find((server) => server.tool === "Claude Code");
      return claude ? [command("claude mcp remove " + claude.name)] : [];
    }
    return [];
  }

  // Applies the fix from the checkup, then shows the checkup again with what changed and the new score.
  async function fixNow(before) {
    const done = await call("fix", { apply: true });
    if (!done) return;
    const fresh = await call("checkup");
    if (!fresh) return;
    const changed = done.data.changes.map((c) => c.file);
    const files = [...new Set(done.data.planned.map((p) => p.file))];
    const text = changed.length
      ? "Fixed. Your AI tools now skip " + (files.length === 1 ? files[0] : files.length + " heavy files") + " (updated " + changed.join(", ") + "). Setup score " + before + " → " + fresh.data.score.score + "/100."
      : "Already done: your AI tools skip these files.";
    result.replaceChildren(el("div", { class: "ok", style: "margin-bottom:12px", text }), ...RENDER.checkup(fresh.data).filter(Boolean));
  }

  const RENDER = {
    checkup(data) {
      updateStats(data);
      // No AI on this laptop yet: ask what they want to do and suggest one, before anything else.
      if (!data.installed.length) {
        const input = el("input", { type: "text", id: "newcomer-task", placeholder: "What do you want to do? e.g. build a landing page", "aria-label": "What do you want to do?" });
        const go = el("button", { class: "btn", text: "Suggest an AI", onclick: () => load("newcomer", { task: input.value }) });
        input.addEventListener("keydown", (e) => e.key === "Enter" && go.click());
        return [el("div", { class: "card best" },
          el("h3", { text: "No AI coding tool found on this laptop" }),
          el("p", { text: "Say what you want to do and you get the AI that suits it, a free option, and how to install each." }),
          el("div", { class: "form", style: "margin:10px 0 0" }, input, go))];
      }
      if (!data.issues.length) return [el("div", { class: "ok", text: "Nothing is wasting your tokens here." })];
      return [
        el("div", { class: "section-title", text: data.issues.length + (data.issues.length === 1 ? " thing is" : " things are") + " wasting your tokens" }),
        el("div", { class: "list" }, data.issues.map((issue, i) =>
          el("div", { class: "card" },
            el("div", { class: "issue" },
              el("span", { class: "num", text: String(i + 1) }),
              el("div", {},
                el("div", { text: issue.problem }),
                el("div", { class: "fix", text: "→ " + issue.fix.replace("Fix it:  npx which-ai-to-use fix", "Make your AI tools skip " + (data.heavy.length === 1 ? "it" : "them") + ". Your code is not touched.") }),
                ...issueActions(issue, data))))),
        ),
      ];
    },
    task(data) {
      const parts = [note("Task type: " + data.labels.join(", "))];
      if (!data.best) return parts.concat(data.notes.map((n) => el("p", { text: n })));
      const o = data.overall;
      const more = o.alsoGreat.length > 2 ? " and " + (o.alsoGreat.length - 2) + " more" : "";
      parts.push(
        el("div", { class: "section-title", text: "Best AI for this task (any tool)" }),
        toolCard({ id: o.id, name: o.name, best: true,
          tags: [el("span", { class: "tag " + (o.installed ? "yes" : "no"), text: o.installed ? "✓ On your laptop" : "Not on your laptop" })],
          body: [el("p", { text: sentence(o.why) }),
            o.installed ? el("p", { text: "You already have it: use the command below." }) : null,
            o.alsoGreat.length ? el("p", { text: "Just as good: " + o.alsoGreat.slice(0, 2).join(", ") + more }) : null],
          action: o.installed ? null : getButton(o.homepage, "Get " + o.name) }),
      );
      const yours = [data.best, ...data.also];
      if (data.free && !yours.some((t) => t.id === data.free.id)) yours.push(data.free);
      parts.push(
        el("div", { class: "section-title", text: "On your laptop" }),
        toolCard({ id: data.best.id, name: data.best.name,
          tags: [el("span", { class: "tag star", text: "Best of yours" }), el("span", { class: "tag", text: data.best.where }), data.best.model ? el("span", { class: "tag", text: "model: " + data.best.model }) : null],
          body: [data.best.id !== o.id ? el("p", { text: sentence(data.best.why) }) : null,
            data.asksFirst ? el("p", { text: "Your task leaves the stack, style and content open, so the command asks you about them first." }) : null,
            command(data.best.command),
            data.files.length ? el("p", { text: "Starts with: " + data.files.join(", ") }) : null],
          action: runButton(data.best.id) }),
      );
      if (yours.length > 1) {
        parts.push(el("div", { class: "grid", style: "margin-top:10px" }, yours.slice(1).map((t) =>
          toolCard({ id: t.id, name: t.name, tags: [el("span", { class: "tag", text: t.where })], body: [t.why !== data.best.why ? el("p", { text: sentence(t.why) }) : null],
            action: t.command && !t.command.startsWith("Open ") ? runButton(t.id, "Run") : null }))));
      }
      if (data.reviewer) parts.push(el("div", { class: "section-title", text: "Second opinion from " + data.reviewer.name }), command(data.reviewer.command));
      if (data.notes.length) parts.push(el("div", { style: "margin-top:18px" }, ...data.notes.map((n) => alertBox({ title: "Good to know", text: n, tone: "info" }))));
      return parts;
    },
    newcomer(data) {
      const parts = [el("p", { class: "muted", text: "No AI tool yet. Task type: " + data.labels.join(", ") + "." })];
      data.options.forEach((o, i) => {
        const card = el("div", { class: "card" + (i === 0 ? " best" : ""), style: "margin-bottom:8px" },
          el("div", { class: "eyebrow", text: o.label }),
          el("h3", {}, o.name, o.free ? el("span", { class: "tag yes", text: "Free" }) : null),
          el("p", { text: sentence(o.why) }));
        if (o.install) {
          card.append(el("p", { class: "muted", text: "Install it:" }), command(o.install), el("p", { class: "muted", text: "Then start the task:" }), command(o.command));
          if (vscodeApi) card.append(el("div", { class: "form", style: "margin:8px 0 0" }, el("button", { class: "btn", text: "Install and start in terminal", onclick: () => vscodeApi.postMessage({ type: "runInTerminal", choice: o.id }) })));
        } else card.append(el("p", {}, el("a", { href: o.homepage, target: "_blank", rel: "noopener", text: "Get " + o.name })));
        parts.push(card);
      });
      parts.push(el("p", { class: "muted" }, "Not into terminals? ", el("a", { href: data.website, target: "_blank", rel: "noopener", text: "The website suggests AI apps for any task." })));
      return parts;
    },
    handoff(data) {
      // What the next AI will read, before anyone runs it: open the file, or look at it here.
      const open = vscodeApi ? el("button", { class: "btn ghost", onclick: () => vscodeApi.postMessage({ type: "openHandoff" }) }, svg("external"), el("span", { text: "Open HANDOFF.md" })) : copyButton(data.note, "Copy HANDOFF.md");
      // A folder without git: the changed files come from the chat.
      const wrote = (d) => d.git !== false ? "Wrote HANDOFF.md: " + d.changes.length + " changed file(s), " + d.commits.length + " commit(s) on " + d.branch + "."
        : d.chat ? "Wrote HANDOFF.md: " + d.changes.length + " file(s) changed in the " + d.chat.name + " chat (this folder has no git)."
          : "Wrote HANDOFF.md. This folder has no git and no AI chat was found for it, so type what you were working on above.";
      const parts = [
        el("div", { class: "ok wrote" }, el("span", { text: wrote(data) }), open),
        el("details", { class: "preview" }, el("summary", { text: "See what the next AI will read" }), el("pre", { class: "raw", text: data.note })),
      ];
      if (data.chat) parts.push(el("p", { class: "muted", text: "Read from the " + data.chat.name + " chat (" + data.chat.requests + " request" + (data.chat.requests === 1 ? "" : "s") + "): “" + data.chat.task + "”" }));
      // The recommended AI first, then the others, then a chat on the web: the same choices as the terminal menu.
      parts.push(el("div", { class: "section-title", text: "Who carries on?" }));
      for (const choice of data.choices.filter((c) => c.id !== "none")) {
        const body = [el("p", { text: sentence(choice.why) })];
        let action = null;
        if (choice.command) {
          if (!choice.installed) body.push(el("p", { class: "muted", text: "Install it first:" }), command(choice.install), el("p", { class: "muted", text: "Then start it:" }));
          body.push(command(choice.command));
          const label = choice.installed ? "Run in terminal" : "Install and run";
          action = runButton(choice.id, label);
        } else if (choice.id === "other") body.push(command("Read HANDOFF.md and continue the task."));
        else action = copyButton(data.web, "Copy note and changes");
        parts.push(el("div", { style: "margin-bottom:8px" }, toolCard({ id: choice.id, name: choice.name, best: choice.recommended, tags: [choice.recommended ? el("span", { class: "tag star", text: "Recommended" }) : null], body, action })));
      }
      if (!data.next.best && data.freeInstall) parts.push(el("p", { class: "muted", text: "No other AI tool is installed. Antigravity CLI has a free tier:" }), command(data.freeInstall));
      if (data.changes.length) parts.push(el("div", { class: "section-title", text: "Changed files in the note" }), el("table", {}, el("tr", {}, el("th", { text: "File" }), el("th", { text: "Change" })), data.changes.map((c) => el("tr", {}, el("td", { text: c.file }), el("td", { text: c.added === null ? c.status : c.status + " (+" + c.added + " −" + c.removed + ")" })))));
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
      const post = (label, href) => el("a", { class: "btn ghost", text: label, href, target: "_blank", rel: "noopener" });
      const parts = [
        canvas,
        el("div", { class: "form", style: "margin-top:14px" }, download, copy, post("Post on X", data.links.x), post("Post on LinkedIn", data.links.linkedin)),
        el("p", { class: "muted", text: data.share }),
        el("p", { class: "muted", text: "The post opens with this line filled in. Download the image first to attach it." }),
      ];
      if (data.items.length) {
        parts.push(el("div", { class: "section-title", text: "What costs points" }),
          el("table", { class: "points" }, data.items.map((i) => el("tr", {}, el("td", { text: String(i.points).replace("-", "−") }), el("td", {}, el("div", { text: i.label }), el("div", { class: "muted", text: "→ " + i.tip }))))));
      }
      return parts;
    },
    usage(data) {
      if (!data.found) return [el("div", { class: "ok", text: "No Claude Code logs on this laptop, so there is no usage to show." })];
      const n = (v) => "~" + v.toLocaleString("en-US");
      const stat = (label, bucket) => el("div", { class: "card" }, el("div", { class: "eyebrow", text: label }), el("h3", { class: "big", text: n(bucket.fresh) + " tokens" }), el("p", { text: bucket.replies + " replies · + " + n(bucket.cached) + " re-read from cache" }));
      const parts = [
        el("div", { class: "card best", style: "margin-bottom:14px" }, el("div", { class: "eyebrow", text: "5-hour limit window (estimate)" }), el("p", { text: data.windowText }), data.etaText && !data.warning ? el("p", { text: data.etaText }) : null),
        data.warning ? alertBox({ title: "Close to your limit", text: data.warning,
          more: [el("p", { text: "To make it last:" }), el("ul", {}, ...data.tips.map((tip) => el("li", {}, el("span", { text: tip.text + ": " }), el("code", { text: tip.command }))))] }) : null,
        el("div", { class: "grid" }, stat("Today", data.today), stat("Last 7 days", data.week)),
      ];
      if (data.projects.length) parts.push(el("div", { class: "section-title", text: "Busiest projects (7 days)" }), el("table", {}, data.projects.map((p) => el("tr", {}, el("td", { text: p.project }), el("td", { text: n(p.fresh) + " tokens" })))));
      if (data.tip) parts.push(el("div", { style: "margin-top:14px" }, alertBox({ title: "Tip", text: data.tip, tone: "info" })));
      return parts;
    },
    report(data) {
      const used = data.tools.filter((t) => t.requests);
      if (!data.week.replies && !used.length) return [el("div", { class: "ok", text: "No AI use found on this laptop in the last 7 days." })];
      const n = (v) => "~" + v.toLocaleString("en-US");
      const parts = [];
      if (data.week.replies) {
        const change = data.change === null ? "" : (data.change >= 0 ? "↑ " : "↓ ") + Math.abs(data.change) + "% vs the week before";
        const most = Math.max(...data.days.map((d) => d.fresh), 1);
        parts.push(el("div", { class: "card best", style: "margin-bottom:14px" }, el("div", { class: "eyebrow", text: "Claude Code, last 7 days" }), el("h3", { class: "big", text: n(data.week.fresh) + " tokens" }), el("p", { text: data.week.replies + " replies" + (change ? " · " + change : "") })),
          el("div", { class: "bars", role: "img", "aria-label": "Tokens per day" }, ...data.days.flatMap((d) => [el("span", { text: d.label }), el("div", { class: "bar", style: "width:" + Math.round((d.fresh / most) * 100) + "%" }), el("span", { class: "num", text: d.fresh ? n(d.fresh) : "0" })])),
          el("table", {},
            data.busiest ? el("tr", {}, el("td", { text: "Busiest day" }), el("td", { text: data.busiest.label + " (" + n(data.busiest.fresh) + " tokens)" })) : null,
            el("tr", {}, el("td", { text: "Limit ran out" }), el("td", { text: data.limits ? data.limits + (data.limits === 1 ? " time" : " times") : "not recorded (the Claude Code plugin records it)" })),
            data.projects.length ? el("tr", {}, el("td", { text: "Busiest projects" }), el("td", { text: data.projects.map((p) => p.project + " " + n(p.fresh)).join(", ") })) : null));
      }
      if (used.length) parts.push(el("div", { class: "section-title", text: "Requests per AI" }), el("table", {}, used.map((t) => el("tr", {}, el("td", { text: t.name }), el("td", { text: t.requests + " in " + t.chats + (t.chats === 1 ? " chat" : " chats") })))));
      const copy = el("button", { class: "btn ghost", text: "Copy text to share", onclick: () => { copyText(data.share); copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy text to share"), 1500); } });
      const post = (label, href) => el("a", { class: "btn ghost", text: label, href, target: "_blank", rel: "noopener" });
      parts.push(el("div", { class: "form", style: "margin-top:14px" }, copy, post("Post on X", data.links.x), post("Post on LinkedIn", data.links.linkedin)), el("p", { class: "muted", text: data.share }));
      return parts;
    },
    ai(data) {
      if (!data.answer) {
        const retry = el("button", { class: "btn ghost", onclick: () => load("ai", { task: $("task").value, consent: true }) }, svg("retry"), el("span", { text: "Try again" }));
        return [alertBox({ title: "Couldn't get an answer from " + data.runner.name, text: sentence(data.fallback) + " Here is the built-in answer instead.", action: retry })].concat(RENDER.task(data.rules));
      }
      const a = data.answer;
      const parts = [note("Answer from " + data.runner.name + " (asked with no tools). Rules answer: " + data.rules.overall.name + " / " + data.rules.best.name + ".")];
      parts.push(el("div", { class: "section-title", text: "Best AI for this task (any tool)" }),
        toolCard({ id: a.bestAnywhere, name: a.bestAnywhereName, best: true,
          tags: [el("span", { class: "tag " + (a.bestAnywhereInstalled ? "yes" : "no"), text: a.bestAnywhereInstalled ? "✓ On your laptop" : "Not on your laptop" })],
          body: [a.bestAnywhereInstalled ? el("p", { text: "You already have it: use the command below." })
            : el("p", {}, "Get it: ", el("a", { href: a.bestAnywhereHomepage, target: "_blank", rel: "noopener", text: a.bestAnywhereHomepage.replace("https://", "") }))],
          action: a.bestAnywhereInstalled ? null : getButton(a.bestAnywhereHomepage, "Get it") }));
      const body = [el("p", { text: a.why }), command(data.command)];
      if (a.questions.length) body.push(el("div", { class: "section-title", text: "Decide first" }), el("p", { class: "muted", text: "The task leaves these open, so the prompt asks you before any code is written:" }), el("ul", {}, a.questions.map((q) => el("li", { text: q }))));
      if (a.steps.length) body.push(el("div", { class: "section-title", text: "Steps" }), el("ol", { class: "steps" }, a.steps.map((s) => el("li", {}, el("span", { text: s })))));
      body.push(el("div", { class: "section-title", text: "Better prompt" }), command(a.prompt));
      parts.push(el("div", { class: "section-title", text: "Use on your laptop" }),
        toolCard({ id: a.bestInstalled, name: a.bestInstalledName, tags: [a.model ? el("span", { class: "tag", text: "model: " + a.model }) : null], body, action: runButton(a.bestInstalled) }));
      return parts;
    },
    slim(data) {
      if (data.applied) return [el("div", { class: "ok", text: "Done. " + data.applied + " now uses the shorter version; the old one is in " + data.applied + ".bak." })];
      if (!data.target) return [el("div", { class: "ok", text: "No instructions file over 2,000 tokens, so there is nothing worth shortening." })];
      if (!data.written) return [alertBox({ title: data.runner.name + " did not return a shorter file", text: "Nothing was written." })];
      return [
        el("div", { class: "grid" },
          el("div", { class: "card" }, el("div", { class: "eyebrow", text: "Now" }), el("h3", { text: "~" + data.before.toLocaleString("en-US") + " tokens per message" })),
          el("div", { class: "card mine" }, el("div", { class: "eyebrow", text: "Shorter copy (" + data.written + ")" }), el("h3", { text: "~" + data.after.toLocaleString("en-US") + " tokens per message" }))),
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
        step("2. Stop wasting tokens", "Fix wasted tokens shows which heavy files your AI tools will skip. Nothing changes until you click Apply; your code is never touched.", "npx which-ai-to-use fix"),
        step("3. Starting a task?", "Which AI for a task?: describe the task to get the best AI and model, the files to start with, and a command to copy.", 'npx which-ai-to-use "add a coupon field to the cart"'),
        step("4. Claude's limit ran out?", "Claude limit over? writes HANDOFF.md, so Antigravity CLI, Codex or a chat like ChatGPT carries on instead of starting over.", "npx which-ai-to-use handoff --copy"),
        step("5. Know when it resets", "Usage shows when your current 5-hour Claude window resets and how much you used today.", "npx which-ai-to-use usage"),
        step("6. Share your score", "Score card makes an image of your AI setup score to post.", "npx which-ai-to-use score --card"),
      ),
      el("p", { class: "muted", style: "margin:14px 0 0", text: inSidebar ? "Prefer the keyboard? Every action is also in the Command Palette: type Which AI." : "Everything here also works in the terminal, and in VS Code as the Which AI sidebar." }),
    ];
  }

  async function load(action, body = {}, applied = false) {
    const response = await call(action, body);
    if (!response) return;
    // Optional parts are null; replaceChildren would print them as the word "null".
    result.replaceChildren(...RENDER[action](response.data, applied, response.text).filter(Boolean));
    if (applied) refreshStats();
    // A task that got an answer is now the newest one asked.
    if (action === "task" || action === "newcomer" || (action === "ai" && body.consent)) loadRecent();
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

  // Tasks asked before in this project, as buttons that ask again. Quiet: no spinner, and nothing shown on an error.
  let currentView = null;
  async function loadRecent() {
    let tasks = [];
    try {
      tasks = (await request("recent", {})).data.tasks;
    } catch {
      tasks = [];
    }
    const ask = (task) => () => { $("task").value = task; $("ask").click(); };
    $("recent").replaceChildren(...(tasks.length ? [el("span", { class: "muted", text: "Asked before:" }),
      ...tasks.map((t) => el("button", { class: "chip-btn", title: t.best ? t.task + " (suggested: " + t.best + ")" : t.task, onclick: ask(t.task) }, svg("usage"), el("span", { text: t.task })))] : []));
    $("recent").classList.toggle("hidden", !tasks.length || currentView !== "task");
  }

  function show(view) {
    currentView = view;
    document.querySelectorAll(".nav-btn").forEach((b) => b.setAttribute("aria-current", String(b.dataset.view === view)));
    $("view-title").textContent = VIEWS[view].title;
    $("view-sub").textContent = VIEWS[view].sub;
    $("form-task").classList.toggle("hidden", view !== "task");
    $("recent").classList.add("hidden");
    $("form-handoff").classList.toggle("hidden", view !== "handoff");
    $("form-slim").classList.toggle("hidden", view !== "slim");
    $("consent").classList.add("hidden");
    result.replaceChildren();
    idle();
    $("updated").textContent = "";
    if (view === "task") {
      $("task").focus();
      loadRecent();
    }
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
  $("consent-no").addEventListener("click", () => { $("consent").classList.add("hidden"); idle("Nothing was sent."); });

  let aiAllowed = false;
  async function ask() {
    const task = $("task").value;
    if (toolsFound === 0) return load("newcomer", { task });
    if (!$("use-ai").checked) return load("task", { task });
    if (aiAllowed) return load("ai", { task, consent: true });
    const preview = await call("ai", { task });
    if (!preview) return;
    result.replaceChildren(...RENDER.task(preview.data.rules).filter(Boolean));
    askConsent(preview.text, () => { aiAllowed = true; load("ai", { task, consent: true }); });
  }

  async function startSlim() {
    const preview = await call("slim");
    if (!preview) return;
    if (!preview.data.needsConsent) return result.replaceChildren(...RENDER.slim(preview.data).filter(Boolean));
    askConsent(preview.text, () => load("slim", { consent: true }));
  }

  document.querySelectorAll(".nav-btn").forEach((b) => b.addEventListener("click", () => show(b.dataset.view)));
  document.querySelectorAll(".stat").forEach((b) => b.addEventListener("click", () => show(b.dataset.go)));

  // Sidebar only: open the full view, and a tip about widening the sidebar until it is dismissed.
  if ($("open-full")) $("open-full").addEventListener("click", () => vscodeApi.postMessage({ type: "openFull" }));
  const tip = $("width-tip");
  if (tip) {
    const dismissed = () => Boolean(vscodeApi.getState()?.tipHidden);
    const update = () => tip.classList.toggle("hidden", dismissed() || window.innerWidth >= 380);
    $("tip-close").addEventListener("click", () => {
      vscodeApi.setState({ ...(vscodeApi.getState() ?? {}), tipHidden: true });
      update();
    });
    window.addEventListener("resize", update);
    update();
  }
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
