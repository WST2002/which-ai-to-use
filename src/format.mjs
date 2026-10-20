import { TOOLS, TOOLS_AS_OF } from "./tools.mjs";

const pad = (label) => `${label}:`.padEnd(9);

export function formatRecommendation(result) {
  const lines = [`Task: ${result.task}  →  ${result.categories.join(", ")}`, ""];
  if (!result.best) {
    lines.push(...result.notes);
    return `${lines.join("\n")}\n`;
  }
  lines.push(`${pad("Best")}${result.best.name} — ${result.best.reason}`);
  for (const alt of result.also) lines.push(`${pad("Also")}${alt.name} — ${alt.reason}`);
  if (result.free && result.free.id !== result.best.id) lines.push(`${pad("Free")}${result.free.name} — ${result.free.reason}`);
  lines.push("", `${pad("Run")}${result.best.command}`);
  if (result.best.model) lines.push(`${pad("Model")}${result.best.model}`);
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
  lines.push("", "Rules files in this project", "");
  for (const [file, exists] of Object.entries(project.rulesFiles)) lines.push(`  ${exists ? "✓" : "✗"} ${file}`);
  if (project.sensitive.length) lines.push("", `Sensitive files: ${project.sensitive.join(", ")} — local tools will be preferred.`);
  lines.push("", `Tool capabilities as of ${TOOLS_AS_OF}.`);
  return `${lines.join("\n")}\n`;
}

const count = (n) => `~${n.toLocaleString("en-US")} tokens`;
const indent = (text, spaces) => text.split("\n").map((line) => `${" ".repeat(spaces)}${line}`).join("\n");

export function formatTokens(report) {
  const lines = ["Token check for this project", "", "Rules files (sent with every message)"];
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
    lines.push("MCP servers: none found");
  } else {
    lines.push("MCP servers loaded (each adds its tool descriptions to every request)");
    for (const tool of new Set(report.mcp.map((server) => server.tool))) {
      lines.push(`  ${tool}: ${report.mcp.filter((s) => s.tool === tool).map((s) => s.name).join(", ")}`);
    }
    lines.push("  Turn off the ones you don't use in this project.");
  }
  return `${lines.join("\n")}\n`;
}

const toolName = (id) => TOOLS.find((tool) => tool.id === id)?.name ?? id;

export function formatSyncPlan(plan) {
  const labels = { create: "create", update: "update", same: "already in sync", differs: "differs (hand-written)" };
  return `Source: ${plan.source}\n${plan.items.map((item) => `  ${item.file} — ${labels[item.status]}`).join("\n")}\n`;
}
