// Each command as a function returning { text, data }, shared by the CLI and the dashboard.
import fs from "node:fs";
import path from "node:path";
import { classifyTask } from "./classify.mjs";
import { applyIgnoreAdvice } from "./fix.mjs";
import { LABELS, checkupIssues, formatCheckup, formatDoctor, formatRecommendation, formatTokens } from "./format.mjs";
import { collectHandoff, renderHandoff } from "./handoff.mjs";
import { scanProject } from "./project.mjs";
import { betterPrompt, relevantFiles, verifyCommand } from "./prompt.mjs";
import { recommend } from "./recommend.mjs";
import { startCost } from "./cost.mjs";
import { listProjectFiles, mcpServers, tokenReport } from "./tokens.mjs";
import { toolById } from "./tools.mjs";

const ids = (installed) => installed.map((found) => found.id);

export function checkupAction({ cwd, home, installed }) {
  const report = tokenReport({ dir: cwd, home, installedIds: ids(installed) });
  const project = path.basename(cwd);
  return { text: formatCheckup({ project, installed, report }), data: { project, installed, ...report, issues: checkupIssues(report) } };
}

export function tokensAction({ cwd, home, installed }) {
  const report = tokenReport({ dir: cwd, home, installedIds: ids(installed) });
  return { text: formatTokens(report), data: report };
}

export function doctorAction({ cwd, installed }) {
  const project = scanProject(cwd);
  return { text: formatDoctor(installed, project), data: { installed, project } };
}

export function recommendAction({ cwd, home, task, installed, prefer = "balanced", private: forcePrivate = false }) {
  const clean = String(task ?? "").trim();
  if (!clean) throw new Error('task is empty: describe it in quotes, e.g. which-ai-to-use "fix the login bug"');
  const { sensitive } = scanProject(cwd);
  const files = relevantFiles(clean, listProjectFiles(cwd));
  const prompt = betterPrompt(clean, files, verifyCommand(cwd));
  const result = recommend({ task: clean, prompt, files, categories: classifyTask(clean), installed, sensitive, prefer, private: forcePrivate });
  if (result.best) {
    const name = toolById(result.best.id).name;
    const addOns = home ? mcpServers({ home, dir: cwd }).filter((server) => server.tool === name).length : 0;
    result.cost = startCost({ dir: cwd, toolId: result.best.id, files, prompt, addOns });
  }
  return { text: formatRecommendation(result), data: { ...result, labels: result.categories.map((c) => LABELS[c] ?? c) } };
}

const CONTINUE = "Read HANDOFF.md and continue the task.";

export function handoffAction({ cwd, task = "", installed, prefer = "balanced", private: forcePrivate = false, date = new Date().toISOString().slice(0, 10) }) {
  const info = collectHandoff(cwd);
  fs.writeFileSync(path.join(info.root, "HANDOFF.md"), renderHandoff({ task, info, verify: verifyCommand(info.root), date }));
  const { sensitive } = scanProject(info.root);
  const next = recommend({ task: CONTINUE, categories: classifyTask(task), installed, sensitive, prefer, private: forcePrivate });
  const lines = [`Wrote HANDOFF.md: ${info.changes.length} changed file(s), ${info.commits.length} commit(s) on ${info.branch}.`, ""];
  if (next.best) lines.push(`Next:    ${next.best.name} — ${next.best.reason}`, `Run:     ${next.best.command}`);
  else lines.push(...next.notes);
  lines.push("", "HANDOFF.md is for the next AI only: don't commit it.");
  return { text: `${lines.join("\n")}\n`, data: { file: "HANDOFF.md", ...info, next } };
}

/** What fix would change; `apply` writes it. */
export function fixAction({ cwd, home, installed, apply = false }) {
  const report = tokenReport({ dir: cwd, home, installedIds: ids(installed) });
  if (!report.ignore.length) {
    return { text: "Nothing to fix: no heavy files, or none of your AI tools can be told to skip files.\n", data: { planned: [], changes: [] } };
  }
  const planned = report.ignore.flatMap((advice) => {
    const files = advice.id === "claude-code" ? report.heavy.map((h) => h.file) : advice.snippet.split("\n");
    return files.map((file) => ({ file, target: advice.file, tool: toolById(advice.id).name }));
  });
  const lines = ["Your AI tools will skip these files:", ...planned.map((p) => `  ${p.file} → ${p.target} (${p.tool})`)];
  if (!apply) return { text: `${lines.join("\n")}\n`, data: { planned, changes: [] } };
  const changes = applyIgnoreAdvice(cwd, report.ignore);
  const skipped = report.ignore.length - changes.length;
  lines.push(changes.length ? `Updated ${changes.map((c) => c.file).join(", ")}${skipped ? ` (${skipped} file skipped)` : ""}.` : "Nothing to fix: your AI tools already skip these files.");
  return { text: `${lines.join("\n")}\n`, data: { planned, changes } };
}
