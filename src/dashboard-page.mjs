const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The single dashboard page. Output is always set with textContent, never as HTML. */
export function dashboardPage({ token, project, version }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>which-ai-to-use — ${escapeHtml(project)}</title>
<style>
  :root { --bg:#f6f7fb; --panel:#fff; --fg:#14161f; --muted:#5b6175; --line:#e3e6ef; --accent:#4f46e5; --accent-fg:#fff; --code:#0f1220; --code-fg:#e6e8f2; --ok:#16803c; --warn:#b45309; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0b0d14; --panel:#141824; --fg:#e8eaf3; --muted:#9aa1b8; --line:#262c3d; --accent:#8b83ff; --accent-fg:#0b0d14; --code:#070910; --code-fg:#dfe3f1; --ok:#4ade80; --warn:#fbbf24; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { padding:18px 24px; border-bottom:1px solid var(--line); background:var(--panel); display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; }
  header h1 { font-size:18px; margin:0; }
  header span { color:var(--muted); font-size:14px; }
  main { display:grid; grid-template-columns: minmax(280px, 380px) 1fr; gap:20px; padding:20px 24px; max-width:1300px; margin:0 auto; }
  @media (max-width: 860px) { main { grid-template-columns: 1fr; padding:16px; } }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:14px 16px; margin-bottom:12px; }
  .card h2 { font-size:15px; margin:0 0 4px; }
  .card p { margin:0 0 10px; color:var(--muted); font-size:13.5px; }
  input[type=text] { width:100%; padding:9px 11px; border:1px solid var(--line); border-radius:9px; background:var(--bg); color:var(--fg); font:inherit; margin-bottom:8px; }
  label.check { display:flex; gap:8px; align-items:center; font-size:13.5px; color:var(--muted); margin-bottom:8px; }
  button { font:inherit; font-weight:600; border:0; border-radius:9px; padding:9px 14px; cursor:pointer; background:var(--accent); color:var(--accent-fg); }
  button.secondary { background:transparent; color:var(--accent); border:1px solid var(--accent); }
  button:disabled { opacity:.55; cursor:progress; }
  .result { background:var(--panel); border:1px solid var(--line); border-radius:14px; display:flex; flex-direction:column; min-height:60vh; }
  .result-head { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:12px 16px; border-bottom:1px solid var(--line); }
  .result-head strong { font-size:15px; }
  pre { margin:0; padding:16px; background:var(--code); color:var(--code-fg); border-radius:0 0 14px 14px; flex:1; overflow:auto; white-space:pre-wrap; font:13.5px/1.6 "Cascadia Code", Consolas, monospace; }
  #status { font-size:13px; color:var(--muted); }
  #status.error { color:var(--warn); }
  #apply { display:none; margin-top:8px; }
  footer { text-align:center; color:var(--muted); font-size:12.5px; padding:10px 0 24px; }
</style>
</head>
<body>
<header><h1>which-ai-to-use</h1><span>Project: ${escapeHtml(project)}${version ? ` · v${escapeHtml(version)}` : ""} · runs only on this laptop</span></header>
<main>
  <section aria-label="Actions">
    <div class="card">
      <h2>Check this project</h2>
      <p>Your AI tools and what is wasting tokens, in plain words.</p>
      <button data-action="checkup">Run checkup</button>
    </div>
    <div class="card">
      <h2>Which AI for a task?</h2>
      <p>Get the best tool and model, with the command to run.</p>
      <input type="text" id="task" placeholder="e.g. fix the login bug" aria-label="Task">
      <button data-action="task">Ask</button>
    </div>
    <div class="card">
      <h2>Claude limit over?</h2>
      <p>Writes HANDOFF.md in your project so another AI carries on.</p>
      <input type="text" id="handoff-task" placeholder="What were you working on?" aria-label="Task to hand off">
      <label class="check"><input type="checkbox" id="without-claude" checked> Leave out Claude Code</label>
      <button data-action="handoff">Write handoff</button>
    </div>
    <div class="card">
      <h2>Fix wasted tokens</h2>
      <p>Shows which heavy files your AI tools will skip. Nothing changes until you apply.</p>
      <button data-action="fix" class="secondary">Preview fix</button>
      <button id="apply">Apply fix</button>
    </div>
    <div class="card">
      <h2>More</h2>
      <p>Token details and installed tools.</p>
      <button data-action="tokens" class="secondary">Token details</button>
      <button data-action="doctor" class="secondary">Installed tools</button>
    </div>
  </section>
  <section class="result" aria-live="polite">
    <div class="result-head"><strong id="title">Checkup</strong><span id="status"></span><button id="copy" class="secondary">Copy</button></div>
    <pre id="output">Loading…</pre>
  </section>
</main>
<footer>Made by Wageesha Tripathi · github.com/WST2002/which-ai-to-use</footer>
<script>
  const TOKEN = ${JSON.stringify(token)};
  const output = document.getElementById("output");
  const status = document.getElementById("status");
  const title = document.getElementById("title");
  const applyButton = document.getElementById("apply");
  const titles = { checkup: "Checkup", task: "Which AI for this task", handoff: "Handoff", fix: "Fix wasted tokens", tokens: "Token details", doctor: "Installed tools" };

  async function run(action, body = {}) {
    const buttons = document.querySelectorAll("button");
    buttons.forEach((b) => (b.disabled = true));
    title.textContent = titles[action];
    status.className = "";
    status.textContent = "Running…";
    try {
      const response = await fetch("/api/" + action, {
        method: "POST",
        headers: { "content-type": "application/json", "x-dashboard-token": TOKEN },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Something went wrong");
      output.textContent = result.text;
      status.textContent = "Done · " + new Date().toLocaleTimeString();
      return result;
    } catch (error) {
      output.textContent = error.message;
      status.className = "error";
      status.textContent = "Error";
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  }

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const action = button.dataset.action;
      applyButton.style.display = "none";
      const body = {};
      if (action === "task") body.task = document.getElementById("task").value;
      if (action === "handoff") {
        body.task = document.getElementById("handoff-task").value;
        if (document.getElementById("without-claude").checked) body.without = ["claude-code"];
      }
      const result = await run(action, body);
      if (action === "fix" && result && result.data.planned.length) applyButton.style.display = "inline-block";
      // On narrow screens the answer sits below the buttons, so bring it into view.
      if (window.matchMedia("(max-width: 860px)").matches) document.querySelector(".result").scrollIntoView({ behavior: "smooth" });
    });
  });

  applyButton.addEventListener("click", async () => {
    applyButton.style.display = "none";
    await run("fix", { apply: true });
  });

  document.getElementById("copy").addEventListener("click", () => navigator.clipboard.writeText(output.textContent));
  for (const id of ["task", "handoff-task"]) {
    document.getElementById(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") document.querySelector('[data-action="' + (id === "task" ? "task" : "handoff") + '"]').click();
    });
  }
  run("checkup");
</script>
</body>
</html>
`;
}
