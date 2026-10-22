import { TOOLS, TOOLS_AS_OF } from "./tools.mjs";

const pad = (label) => `${label}:`.padEnd(9);

export const LABELS = {
  ui: "design (UI)",
  "multi-file-feature": "new feature",
  "bug-fix": "bug fix",
  tests: "tests",
  refactor: "refactor",
  "code-review": "code review",
  "explain-codebase": "understand the code",
  docs: "docs",
  "quick-edit": "small edit",
  "security-sensitive": "risky (security, payments, data)",
};

const freeToolNames = (installed) =>
  installed.map((found) => TOOLS.find((tool) => tool.id === found.id)).filter((tool) => tool && (tool.capabilities.freeTier || tool.id === "ollama")).map((tool) => tool.name);

/** A tip only when today is well above the daily average of the last 7 days. */
export function usageTip(usage, installed) {
  const average = usage.week.fresh / 7;
  if (!usage.today.fresh || usage.today.fresh < 2 * average) return null;
  const free = freeToolNames(installed);
  const where = free.length ? `${free[0]} (free)` : "Claude with --model haiku";
  return `Today is ${(usage.today.fresh / average).toFixed(1)}× your daily average. Send small tasks to ${where} to save your Claude limit.`;
}

const WARN_SHARE = 0.8;
// Below this a "busiest window" says little about the limit, so no warning is given.
const MIN_REFERENCE = 20000;

/** A heads-up when the current 5-hour window is close to where the limit ran out, or to the busiest window. */
export function limitWarning(usage, installed) {
  const { window, limit } = usage;
  if (!window || !limit || limit.tokens < MIN_REFERENCE) return null;
  const share = window.fresh / limit.tokens;
  if (share < WARN_SHARE) return null;
  const free = freeToolNames(installed);
  const where = free.length ? `${free[0]} (free)` : "Claude with --model haiku";
  const reference = limit.source === "limit" ? "what you had used when your limit ran out last time" : "your busiest 5-hour window this week";
  return `This window is at ${Math.round(share * 100)}% of ${reference} (~${limit.tokens.toLocaleString("en-US")} tokens); it resets about ${clock(window.end)}. Send small tasks to ${where} to make it last.`;
}

/** What to do when the limit is close, so the rest of the window lasts longer; each tip with the command to run. */
export function stretchTips(installed) {
  const has = (id) => installed.some((found) => found.id === id);
  const free = freeToolNames(installed);
  const tips = [{ text: "Shrink the conversation, so every message costs less", command: "/compact (in Claude Code)" }];
  if (has("claude-code")) tips.push({ text: "Use the small model for small edits", command: 'claude --model haiku "your task"' });
  tips.push({
    text: free.length ? `Send the next task to another AI, like ${free[0]} (free)` : "Send the next task to another AI you have",
    command: 'npx which-ai-to-use "your task" --without claude-code',
  });
  tips.push({ text: "Save where you are before the limit hits, so any AI can carry on", command: "npx which-ai-to-use handoff --to none" });
  return tips;
}

const clock = (ms) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function duration(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

/** "19:00 (in 2 h 5 min)" */
export const resetTime = (end, now = new Date()) => `${clock(end)} (in ${duration(end - now.getTime())})`;

/** "~1,200 tokens in 4 replies since 14:00 · resets about 19:00 (in 1 h 12 min)", or how a new window starts. */
export function windowLine(window, now = new Date()) {
  if (!window) return "No 5-hour window is open: your next Claude message starts a fresh one.";
  const replies = `${window.replies} repl${window.replies === 1 ? "y" : "ies"}`;
  return `~${window.fresh.toLocaleString("en-US")} tokens in ${replies} since ${clock(window.start)} · resets about ${clock(window.end)} (in ${duration(window.end - now.getTime())})`;
}

export function formatUsage(usage, installed, now = new Date()) {
  if (!usage.found) return "No Claude Code logs found on this laptop, so there is no usage to show.\n";
  const line = (label, bucket) =>
    `  ${label.padEnd(13)}~${bucket.fresh.toLocaleString("en-US")} tokens in ${bucket.replies} repl${bucket.replies === 1 ? "y" : "ies"} (+ ~${bucket.cached.toLocaleString("en-US")} re-read from cache)`;
  const lines = [
    "Claude Code usage on this laptop",
    "",
    "5-hour limit window (estimate)",
    `  ${windowLine(usage.window, now)}`,
    ...(limitWarning(usage, installed) ? [`  ⚠ ${limitWarning(usage, installed)}`, "", "To make it last:", ...stretchTips(installed).map((tip) => `  • ${tip.text}: ${tip.command}`)] : []),
    "",
    line("Today:", usage.today),
    line("Last 7 days:", usage.week),
  ];
  if (usage.projects.length) lines.push(`  Busiest projects (7 days): ${usage.projects.map((p) => `${p.project} ~${p.fresh.toLocaleString("en-US")}`).join(", ")}`);
  const tip = usageTip(usage, installed);
  if (tip) lines.push("", `Tip: ${tip}`);
  lines.push("", "Read from Claude Code's own logs on this laptop: only the numbers, never your messages.");
  return `${lines.join("\n")}\n`;
}

export function formatAiAnswer({ runner, seconds, answer, anywhere, installedIds, command, rules }) {
  const indent = "   ";
  const installed = installedIds.includes(anywhere.id);
  const installedName = TOOLS.find((tool) => tool.id === answer.bestInstalled).name;
  const lines = [
    `🤖 Answer from ${runner.name} (asked with no tools${runner.local ? ", on this laptop" : ""}) · ${seconds} s`,
    "",
    `① Best AI for this task: ${anywhere.name} ${installed ? "✓ on your laptop" : `✗ not on your laptop (${anywhere.homepage.replace(/^https:\/\//, "")})`}`,
    `② On your laptop, use: ${installedName}${answer.model ? ` · model: ${answer.model}` : ""}`,
    `${indent}Why: ${answer.why}`,
    "",
    "Better prompt:",
    ...answer.prompt.split("\n").map((line) => `${indent}${line}`),
  ];
  if (answer.steps.length) lines.push("", "Steps:", ...answer.steps.map((step, i) => `${indent}${i + 1}. ${step}`));
  lines.push("", `${pad("Run")}${command}`);
  const agrees = rules.overall.id === anywhere.id && rules.best.id === answer.bestInstalled;
  lines.push("", `Rules answer: ${rules.overall.name} / ${rules.best.name}${agrees ? " (the AI agrees)" : " (the AI chose differently)"}`);
  return `${lines.join("\n")}\n`;
}

export function formatScore(result) {
  const lines = [`AI setup score: ${result.score}/100 (${result.grade})`, ""];
  if (!result.items.length) lines.push("Nothing to improve: your AI tools get a lean, well-described project.");
  else {
    lines.push("What costs points:");
    for (const item of result.items) lines.push(`  ${String(item.points).replace("-", "−").padStart(4)}  ${item.label}`, `        → ${item.tip}`);
    if (result.saving) lines.push("", `Fixing these saves ~${result.saving.toLocaleString("en-US")} tokens.`);
  }
  lines.push("", "Share it:", `  ${result.share}`);
  if (result.links) lines.push("", `Post on X:         ${result.links.x}`, `Post on LinkedIn:  ${result.links.linkedin}`);
  lines.push("", "Want an image to post? Run npx which-ai-to-use score --card");
  return `${lines.join("\n")}\n`;
}

/** 1234 → "1.2k", 3400000 → "3.4M". */
export const shortNumber = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n)).replace(".0", "");

const BAR_WIDTH = 24;

/** The last 7 days next to the week before: tokens per day as bars, limit hits, requests per AI and a line to share. */
export function formatReport(report) {
  const lines = ["Your AI week (last 7 days)", ""];
  const used = report.tools.filter((t) => t.requests);
  if (!report.week.replies && !used.length) {
    return "No AI use found on this laptop in the last 7 days (Claude Code, Codex CLI and Gemini CLI logs).\n";
  }
  if (report.week.replies) {
    const change = report.change === null ? "" : `  (${report.change >= 0 ? "↑" : "↓"} ${Math.abs(report.change)}% vs the week before)`;
    lines.push(`Claude Code: ~${report.week.fresh.toLocaleString("en-US")} tokens in ${report.week.replies} replies${change}`, "");
    const most = Math.max(...report.days.map((d) => d.fresh), 1);
    for (const day of report.days) lines.push(`  ${day.label}  ${"█".repeat(Math.round((day.fresh / most) * BAR_WIDTH)).padEnd(BAR_WIDTH)}  ${shortNumber(day.fresh)}`);
    lines.push("");
    if (report.busiest) lines.push(`Busiest day:      ${report.busiest.label} (~${report.busiest.fresh.toLocaleString("en-US")} tokens)`);
    lines.push(`Limit ran out:    ${report.limits ? `${report.limits} time${report.limits === 1 ? "" : "s"}` : "not recorded (the Claude Code plugin records it)"}`);
    if (report.projects.length) lines.push(`Busiest projects: ${report.projects.map((p) => `${p.project} ~${shortNumber(p.fresh)}`).join(", ")}`);
  }
  if (used.length) lines.push(`Requests:         ${used.map((t) => `${t.name} ${t.requests} in ${t.chats} chat${t.chats === 1 ? "" : "s"}`).join(" · ")}`);
  lines.push("", "Share it:", `  ${report.share}`, "", `Post on X:         ${report.links.x}`, `Post on LinkedIn:  ${report.links.linkedin}`);
  lines.push("", "Read from the AIs' own logs on this laptop: only numbers, never your messages.");
  return `${lines.join("\n")}\n`;
}

/** "~1,510 tokens before any work (CLAUDE.md ~1,000 · files ~500 · prompt ~10) + 3 add-ons; the work itself uses more". */
export function costLine(cost) {
  const parts = [cost.instructions && `${cost.instructions.file} ~${cost.instructions.tokens.toLocaleString("en-US")}`, cost.files && `files ~${cost.files.toLocaleString("en-US")}`, `prompt ~${cost.prompt.toLocaleString("en-US")}`].filter(Boolean);
  const addOns = cost.addOns ? ` + ${cost.addOns} add-on${cost.addOns === 1 ? "" : "s"}` : "";
  return `~${cost.total.toLocaleString("en-US")} tokens before any work (${parts.join(" · ")})${addOns}; the work itself uses more`;
}

const sentence = (text) => `${text[0].toUpperCase()}${text.slice(1)}.`;

export function formatRecommendation(result) {
  const lines = [`Task: ${result.task}  →  ${result.categories.map((c) => LABELS[c] ?? c).join(", ")}`, ""];
  if (!result.best) {
    lines.push(...result.notes);
    return `${lines.join("\n")}\n`;
  }
  const { overall, best } = result;
  const indent = "   ";
  lines.push("① Best AI for this task (any tool)", `${indent}${overall.name}: ${overall.why}.`);
  lines.push(overall.installed ? `${indent}✓ It's on your laptop, use it.` : `${indent}✗ Not on your laptop · get it: ${overall.homepage.replace(/^https:\/\//, "")}`);
  if (overall.alsoGreat.length) {
    const more = overall.alsoGreat.length > 2 ? ` and ${overall.alsoGreat.length - 2} more` : "";
    lines.push(`${indent}Just as good: ${overall.alsoGreat.slice(0, 2).join(", ")}${more}`);
  }

  const yours = [best, ...result.also];
  if (result.free && !yours.some((entry) => entry.id === result.free.id)) yours.push(result.free);
  // With one tool that is also the best anywhere, ① has already said "use it".
  if (yours.length > 1 || best.id !== overall.id) {
    lines.push("", `② On your laptop: ${yours.map((entry) => entry.name).join(", ")}`, `${indent}Best of these: ${best.name} ★ (${best.where})`);
    if (best.id !== overall.id) lines.push(`${indent}${sentence(best.why)}`);
    for (const alt of yours.slice(1)) lines.push(`${indent}Also: ${alt.name} (${alt.where})${alt.why === best.why ? "" : `: ${alt.why}`}`);
  }

  lines.push("");
  if (result.files?.length) lines.push(`${pad("Files")}${result.files.join(", ")}`);
  lines.push(`${pad("Run")}${best.command}`);
  if (best.model) lines.push(`${pad("Model")}${best.model}`);
  if (result.cost) lines.push(`${pad("Start")}${costLine(result.cost)}`);
  if (result.reviewer) lines.push(`${pad("Review")}${result.reviewer.command}  (second opinion from ${result.reviewer.name})`);
  if (result.notes.length) lines.push("", ...result.notes.map((note) => `Note: ${note}`));
  return `${lines.join("\n")}\n`;
}

export function formatDoctor(installed, project) {
  const byId = new Map(installed.map((found) => [found.id, found]));
  const lines = ["AI tools on this machine", ""];
  for (const tool of TOOLS) {
    const found = byId.get(tool.id);
    if (!found) {
      lines.push(`  ✗ ${tool.name}`);
      continue;
    }
    const models = found.models?.length ? ` — models: ${found.models.join(", ")}` : "";
    const warning = found.onPath ? "" : " (settings found, command not on PATH)";
    lines.push(`  ✓ ${tool.name}${warning} — ${found.via.join(", ")}${models}`);
  }
  lines.push("", "Instructions files in this project", "");
  for (const [file, exists] of Object.entries(project.rulesFiles)) lines.push(`  ${exists ? "✓" : "✗"} ${file}`);
  if (project.sensitive.length) {
    const hasLocal = installed.some((found) => TOOLS.find((tool) => tool.id === found.id)?.capabilities.local);
    const advice = hasLocal
      ? "local tools will be ranked first."
      : "none of your AI tools run on this laptop, so code you share goes to a cloud service. For private work, install Ollama.";
    lines.push("", `Sensitive files: ${project.sensitive.join(", ")} — ${advice}`);
  }
  lines.push("", `Tool capabilities as of ${TOOLS_AS_OF}.`);
  return `${lines.join("\n")}\n`;
}

const count = (n) => `~${n.toLocaleString("en-US")} tokens`;
const indent = (text, spaces) => text.split("\n").map((line) => `${" ".repeat(spaces)}${line}`).join("\n");

export function formatTokens(report) {
  const lines = ["Token check for this project", "", "Instructions files (sent with every message)"];
  if (!report.rules.length) lines.push("  none found");
  for (const rule of report.rules) {
    lines.push(`  ${rule.large ? "!" : "✓"} ${rule.file.padEnd(32)}  ${count(rule.tokens)}${rule.large ? "  (over 2,000: trim it)" : ""}`);
    if (rule.large) lines.push(`      Largest sections: ${rule.sections.map((s) => `${s.title} ${count(s.tokens)}`).join(" · ")}`);
  }

  lines.push("");
  if (!report.heavy.length) {
    lines.push("Heavy files: none found");
  } else {
    const total = report.heavy.reduce((sum, file) => sum + file.tokens, 0);
    lines.push(`Heavy files an agent may read (${count(total)} in total)`);
    for (const file of report.heavy) lines.push(`  ${file.file.padEnd(34)}  ${count(file.tokens)}`);
    if (report.ignore.length) {
      lines.push("", "  Tell your AI tools to skip them:");
      for (const advice of report.ignore) lines.push(`  ${toolName(advice.id)} → ${advice.file}`, indent(advice.snippet, 6));
    }
  }

  lines.push("");
  if (!report.mcp.length) {
    lines.push("Add-ons (MCP servers): none found");
  } else {
    lines.push("Add-ons (MCP servers) switched on: each one is sent with every message");
    for (const tool of new Set(report.mcp.map((server) => server.tool))) {
      lines.push(`  ${tool}: ${report.mcp.filter((s) => s.tool === tool).map((s) => s.name).join(", ")}`);
    }
    lines.push("  Turn off the ones you don't use in this project.");
  }
  return `${lines.join("\n")}\n`;
}

const short = (names, max = 3) => (names.length > max ? `${names.slice(0, max).join(", ")}…` : names.join(", "));

/** What wastes tokens, in plain words, each with one fix. `kind` lets the dashboard offer the matching button. */
export function checkupIssues(report) {
  const issues = [];
  for (const rule of report.rules.filter((r) => r.large)) {
    const biggest = rule.sections[0];
    issues.push({
      kind: "instructions",
      tokens: rule.tokens,
      problem: `${rule.file} (your instructions file) is ${count(rule.tokens)}. It is sent with every message.`,
      fix: `Make it shorter. The biggest part is "${biggest.title}" (${count(biggest.tokens)}).`,
    });
  }
  if (report.heavy.length) {
    const [first] = report.heavy;
    const total = report.heavy.reduce((sum, file) => sum + file.tokens, 0);
    const what = report.heavy.length === 1 ? `${first.file} is ${count(first.tokens)}` : `${report.heavy.length} big files (${count(total)}, e.g. ${first.file})`;
    issues.push({
      kind: report.ignore.length ? "heavy-files" : "heavy-files-manual",
      tokens: total,
      problem: `${what}. Your AI can read ${report.heavy.length === 1 ? "it" : "them"} while searching.`,
      fix: report.ignore.length ? "Fix it:  npx which-ai-to-use fix" : "Tell your AI tool to skip it.",
    });
  }
  if (report.mcp.length) {
    const names = [...new Set(report.mcp.map((server) => server.name))];
    const claude = report.mcp.find((server) => server.tool === "Claude Code");
    const how = claude ? `, e.g. claude mcp remove ${claude.name}` : "";
    issues.push({
      kind: "add-ons",
      tokens: 0,
      problem: `${names.length} add-on${names.length === 1 ? " is" : "s are"} switched on (${short(names)}). Each one is sent with every message.`,
      fix: `Turn off the ones you don't use${how}`,
    });
  }
  return issues;
}

/** The default screen: what is installed and, in plain words, what wastes tokens and how to fix it. */
export function formatCheckup({ project, installed, report, score }) {
  const lines = [`✓ Checked: ${project}`, ""];
  if (score) lines.push(`AI setup score: ${score.score}/100 (${score.grade})`, "");
  lines.push(installed.length ? `Your AI tools: ${installed.map((found) => found.name).join(", ")}` : "No AI coding tools found. Free options: Gemini CLI (free tier) or Ollama (runs on your laptop).");
  lines.push("");

  const issues = checkupIssues(report);
  if (issues.length) {
    lines.push(`${issues.length} thing${issues.length === 1 ? " is" : "s are"} wasting your tokens:`);
    issues.forEach(({ problem, fix }, i) => lines.push(`  ${i + 1}. ${problem}`, `     → ${fix}`));
  } else {
    lines.push("Nothing is wasting your tokens here.");
  }
  lines.push(
    "",
    `${"Starting a task?".padEnd(22)}npx which-ai-to-use "your task"`,
    `${"Claude limit over?".padEnd(22)}npx which-ai-to-use handoff`,
    `${"All commands:".padEnd(22)}npx which-ai-to-use --help`,
  );
  return `${lines.join("\n")}\n`;
}

const toolName = (id) => TOOLS.find((tool) => tool.id === id)?.name ?? id;

export function formatSyncPlan(plan) {
  const labels = { create: "create", update: "update", same: "already in sync", differs: "differs (hand-written)" };
  return `Source: ${plan.source}\n${plan.items.map((item) => `  ${item.file} — ${labels[item.status]}`).join("\n")}\n`;
}
