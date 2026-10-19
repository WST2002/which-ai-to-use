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

export function formatSyncPlan(plan) {
  const labels = { create: "create", update: "update", same: "already in sync", differs: "differs (hand-written)" };
  return `Source: ${plan.source}\n${plan.items.map((item) => `  ${item.file} — ${labels[item.status]}`).join("\n")}\n`;
}
