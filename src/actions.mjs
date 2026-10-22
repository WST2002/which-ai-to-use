// Each command as a function returning { text, data }, shared by the CLI and the dashboard.
import fs from "node:fs";
import path from "node:path";
import { classifyTask } from "./classify.mjs";
import { applyIgnoreAdvice } from "./fix.mjs";
import { LABELS, checkupIssues, formatAiAnswer, formatCheckup, formatDoctor, formatRecommendation, formatScore, formatTokens, formatUsage, usageTip, windowLine } from "./format.mjs";
import { setupScore } from "./score.mjs";
import { claudeUsage } from "./usage.mjs";
import { copyFileToClipboard } from "./clipboard.mjs";
import { lastClaudeChat } from "./chat.mjs";
import { collectHandoff, renderHandoff } from "./handoff.mjs";
import { RULES_FILES, scanProject } from "./project.mjs";
import { buildSlimPrompt, parseSlim, slimFileName } from "./slim.mjs";
import { betterPrompt, relevantFiles, verifyCommand } from "./prompt.mjs";
import { recommend, runCommandFor } from "./recommend.mjs";
import { aiRunner, askAi, buildAiPrompt, parseAiAnswer } from "./ai.mjs";
import { startCost } from "./cost.mjs";
import { estimateTokens, listProjectFiles, mcpServers, rulesCost, tokenReport } from "./tokens.mjs";
import { TOOLS, toolById } from "./tools.mjs";

const ids = (installed) => installed.map((found) => found.id);

export function checkupAction({ cwd, home, installed }) {
  const report = tokenReport({ dir: cwd, home, installedIds: ids(installed) });
  const project = path.basename(cwd);
  const score = setupScore({ report, installed, verify: verifyCommand(cwd) });
  return { text: formatCheckup({ project, installed, report, score }), data: { project, installed, ...report, issues: checkupIssues(report), score } };
}

export function scoreAction({ cwd, home, installed }) {
  const report = tokenReport({ dir: cwd, home, installedIds: ids(installed) });
  const result = setupScore({ report, installed, verify: verifyCommand(cwd) });
  return { text: formatScore(result), data: { project: path.basename(cwd), ...result } };
}

export function tokensAction({ cwd, home, installed }) {
  const report = tokenReport({ dir: cwd, home, installedIds: ids(installed) });
  return { text: formatTokens(report), data: report };
}

/**
 * AI mode. Without consent it only says which AI would be asked and what would be sent.
 * With consent it asks that AI (no tools) and falls back to the rules answer if the reply is unusable.
 */
export async function aiAction({ cwd, home, task, installed, consent = false, ask = askAi }) {
  const rules = recommendAction({ cwd, home, task, installed });
  const runner = aiRunner(installed);
  if (!runner) {
    throw new Error("AI mode needs an AI you can run from the terminal (claude, gemini, codex or ollama). Install one, or use the answer without --ai.");
  }
  const sends = ["your task", "the names of your AI tools", "the names of matching files (not their contents)"];
  if (!consent) {
    const where = runner.local ? "It runs on this laptop." : "It is a cloud service and uses your usage limit.";
    return {
      text: `AI mode will ask ${runner.name}: ${sends.join(", ")}. ${where}\n`,
      data: { needsConsent: true, runner, sends, rules: rules.data },
    };
  }
  const r = rules.data;
  const question = buildAiPrompt({ task: r.task, labels: r.labels, installed, files: r.files, verify: verifyCommand(cwd), rules: { overall: r.overall.id, best: r.best.id } });
  const reply = await ask(runner, question);
  const answer = reply.ok ? parseAiAnswer(reply.text, { installedIds: installed.map((f) => f.id) }) : null;
  if (!answer) {
    const reason = reply.ok ? `${runner.name} did not give a usable answer` : `${runner.name} could not answer (${reply.error})`;
    return { text: `${reason}, so here is the rules answer.\n\n${rules.text}`, data: { runner, answer: null, fallback: reason, rules: r } };
  }
  const anywhere = toolById(answer.bestAnywhere);
  const installedFound = installed.find((f) => f.id === answer.bestInstalled);
  const command = runCommandFor(installedFound, answer.prompt, answer.model);
  const named = {
    ...answer,
    bestAnywhereName: anywhere.name,
    bestAnywhereInstalled: installed.some((f) => f.id === anywhere.id),
    bestInstalledName: toolById(answer.bestInstalled).name,
    bestAnywhereHomepage: anywhere.homepage,
  };
  return { text: formatAiAnswer({ runner, seconds: reply.seconds, answer, anywhere, installedIds: installed.map((f) => f.id), command, rules: r }), data: { runner, answer: named, command, rules: r } };
}

/**
 * Slim the largest instructions file with an installed AI. Without consent it only explains what would be sent.
 * The result goes to <file>.slim.md; `apply` swaps it in and keeps the old file as <file>.bak.
 */
export async function slimAction({ cwd, installed, consent = false, apply = false, ask = askAi }) {
  const target = rulesCost(cwd).filter((rule) => rule.large).sort((a, b) => b.tokens - a.tokens)[0];
  if (apply) {
    const pending = RULES_FILES.find((file) => fs.existsSync(path.join(cwd, slimFileName(file))));
    if (!pending) throw new Error("nothing to apply: run slim first");
    fs.copyFileSync(path.join(cwd, pending), path.join(cwd, `${pending}.bak`));
    fs.renameSync(path.join(cwd, slimFileName(pending)), path.join(cwd, pending));
    return { text: `Replaced ${pending}; the old one is in ${pending}.bak.\n`, data: { applied: pending } };
  }
  if (!target) return { text: "No instructions file over 2,000 tokens, so there is nothing worth slimming.\n", data: { target: null } };
  const runner = aiRunner(installed);
  if (!runner) throw new Error("slim needs an AI you can run from the terminal (claude, gemini, codex or ollama).");
  if (!consent) {
    return {
      text: `slim will send the full text of ${target.file} (~${target.tokens.toLocaleString("en-US")} tokens) to ${runner.name}${runner.local ? ", which runs on this laptop" : ", a cloud service"}.\n`,
      data: { needsConsent: true, runner, target },
    };
  }
  const original = fs.readFileSync(path.join(cwd, target.file), "utf8");
  const reply = await ask(runner, buildSlimPrompt(target.file, original));
  const slim = reply.ok ? parseSlim(reply.text, original) : null;
  if (!slim) {
    const reason = reply.ok ? "did not return a shorter file" : `could not answer (${reply.error})`;
    return { text: `${runner.name} ${reason}. Nothing was written.\n`, data: { runner, target, written: null } };
  }
  const written = slimFileName(target.file);
  fs.writeFileSync(path.join(cwd, written), slim);
  const after = estimateTokens(slim);
  const text = [
    `${runner.name} wrote ${written}: ~${target.tokens.toLocaleString("en-US")} → ~${after.toLocaleString("en-US")} tokens per message.`,
    `${target.file} is unchanged. Read ${written}; if it keeps everything you need, run: npx which-ai-to-use slim --apply`,
  ].join("\n");
  return { text: `${text}\n`, data: { runner, target, written, before: target.tokens, after, slim } };
}

export function usageAction({ home, installed, now = new Date() }) {
  const usage = claudeUsage({ home, now });
  return { text: formatUsage(usage, installed, now), data: { ...usage, tip: usageTip(usage, installed), windowText: windowLine(usage.window, now) } };
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
const NO_OTHER_AI = [
  "No other AI tool is installed. To carry on:",
  "  1. Paste HANDOFF.md into ChatGPT (chatgpt.com) or Gemini (gemini.google.com) and ask it to continue.",
  `  2. Or install Gemini CLI (free tier): npm i -g @google/gemini-cli, then run: gemini -i "${CONTINUE}"`,
];

/** `leftOut`: tools left out because their limit is over, named in the answer. `copy`: also put the note on the clipboard. */
export function handoffAction({ cwd, home, task = "", installed, leftOut = [], copy = false, menu = false, prefer = "balanced", private: forcePrivate = false, date = new Date().toISOString().slice(0, 10) }) {
  const info = collectHandoff(cwd);
  const file = path.join(info.root, "HANDOFF.md");
  // The Claude Code chat says what was asked and where it stopped, so nobody has to type the task again.
  const chat = home ? lastClaudeChat({ home, cwd: info.root }) : null;
  const note = renderHandoff({ task, info, verify: verifyCommand(info.root), date, chat });
  fs.writeFileSync(file, note);
  const { sensitive } = scanProject(info.root);
  const available = installed.filter((found) => !leftOut.includes(found.id));
  const next = recommend({ task: CONTINUE, categories: classifyTask(task || chat?.task || ""), installed: available, sensitive, prefer, private: forcePrivate });
  const lines = [];
  if (chat) lines.push(`Read the Claude Code chat: "${chat.task.length > 70 ? `${chat.task.slice(0, 69)}…` : chat.task}" (${chat.requests} request${chat.requests === 1 ? "" : "s"}).`);
  lines.push(`Wrote HANDOFF.md: ${info.changes.length} changed file(s), ${info.commits.length} commit(s) on ${info.branch}.`, "");
  if (leftOut.length) lines.push(`Left out: ${leftOut.map((id) => toolById(id).name).join(", ")} (limit over). Handing off from another AI? Add --without <tool>.`, "");
  const categories = classifyTask(task || chat?.task || "");
  const choices = handoffChoices(next, installSuggestion({ installed, leftOut, categories, sensitive, prefer, forcePrivate }));
  if (!menu) {
    if (next.best) lines.push(`Next:    ${next.best.name} — ${next.best.reason}`, `Run:     ${next.best.command}`);
    else lines.push(...NO_OTHER_AI);
  }
  if (copy) {
    lines.push("", copyFileToClipboard(file) ? "Copied HANDOFF.md to your clipboard: paste it into any AI chat." : "Could not reach the clipboard (no clipboard tool found): open HANDOFF.md and copy it.");
  } else if (!next.best && !menu) lines.push("", "Add --copy to put HANDOFF.md on your clipboard.");
  if (!menu) lines.push("", "HANDOFF.md is for the next AI only: don't commit it.");
  return { text: `${lines.join("\n")}\n`, data: { file: "HANDOFF.md", ...info, next, choices, note, chat: chat && { task: chat.task, requests: chat.requests } } };
}

/**
 * Where the work can go next: the recommended AI first, then the other installed ones that run in a terminal,
 * then a chat on the web (the note is copied), then nothing. Each AI comes with the command that starts it.
 */
export function handoffChoices(next, suggestion = null) {
  const seen = new Set();
  const tools = [next.best, ...next.also, next.free]
    .filter((entry) => entry && !seen.has(entry.id) && seen.add(entry.id) && entry.command && !entry.command.startsWith("Open "))
    .map((entry, i) => ({ id: entry.id, name: entry.name, why: entry.why, command: entry.command, installed: true, recommended: i === 0 }));
  // The best AI that is not on this laptop yet, with its official install command; installing is the user's call.
  const notInstalled = suggestion && !seen.has(suggestion.id)
    ? [{ id: suggestion.id, name: suggestion.name, why: `${suggestion.why}; not installed yet`, command: suggestion.command, install: suggestion.install, installed: false, recommended: false }]
    : [];
  return [
    ...tools,
    ...notInstalled,
    { id: "web", name: "ChatGPT or Gemini on the web", why: "HANDOFF.md is copied to your clipboard; paste it into the chat", command: null, recommended: tools.length === 0 },
    { id: "other", name: "Another AI", why: `start any AI here and tell it: ${CONTINUE}`, command: null, recommended: false },
    { id: "none", name: "Nothing now", why: "keep HANDOFF.md and decide later", command: null, recommended: false },
  ];
}

/** The best AI with an install command that is not installed (or left out), ranked for continuing the task. */
function installSuggestion({ installed, leftOut, categories, sensitive, prefer, forcePrivate }) {
  const have = new Set(installed.map((found) => found.id));
  const candidates = TOOLS.filter((tool) => tool.install && !have.has(tool.id) && !leftOut.includes(tool.id))
    .map((tool) => ({ id: tool.id, onPath: true, via: [`command: ${tool.detect.bins[0]}`] }));
  if (!candidates.length) return null;
  const best = recommend({ task: CONTINUE, categories, installed: candidates, sensitive, prefer, private: forcePrivate }).best;
  return best && { ...best, install: toolById(best.id).install };
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
