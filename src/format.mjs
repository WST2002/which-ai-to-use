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

const sentence = (text) => `${text[0].toUpperCase()}${text.slice(1)}.`;

export function formatRecommendation(result) {
  const lines = [`Task: ${result.task}  →  ${result.categories.map((c) => LABELS[c] ?? c).join(", ")}`, ""];
  if (!result.best) {
    lines.push(...result.notes);
    return `${lines.join("\n")}\n`;
  }
  const tool = (label, entry) => [`${pad(label)}${entry.name} (${entry.where})`, `${" ".repeat(9)}${sentence(entry.why)}`];
  lines.push(...tool("Best", result.best));
  for (const alt of result.also) lines.push(...tool("Also", alt));
  if (result.free && result.free.id !== result.best.id && !result.also.some((a) => a.id === result.free.id)) lines.push(...tool("Free", result.free));
  lines.push("");
  if (result.files?.length) lines.push(`${pad("Files")}${result.files.join(", ")}`);
  lines.push(`${pad("Run")}${result.best.command}`);
  if (result.best.model) lines.push(`${pad("Model")}${result.best.model}`);
  if (result.reviewer) lines.push(`${pad("Review")}${result.reviewer.command}  (second opinion from ${result.reviewer.name})`);
  if (result.suggested?.length) {
    lines.push("", "Not installed, but good for this:", ...result.suggested.map((s) => `  • ${s.name}: ${s.why} (${s.homepage})`));
  }
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
export function formatCheckup({ project, installed, report }) {
  const lines = [`✓ Checked: ${project}`, ""];
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
