// Each command as a function returning { text, data }, shared by the CLI and the dashboard.
import fs from "node:fs";
import path from "node:path";
import { classifyTask } from "./classify.mjs";
import { applyIgnoreAdvice } from "./fix.mjs";
import { LABELS, checkupIssues, formatAiAnswer, formatCheckup, formatDoctor, formatRecommendation, formatReport, formatScore, formatTokens, etaLine, formatUsage, limitEta, limitWarning, resetTime, shortNumber, stretchTips, usageTip, windowLine } from "./format.mjs";
import { setupScore } from "./score.mjs";
import { claudeUsage } from "./usage.mjs";
import { weeklyReport } from "./report.mjs";
import { copyTextToClipboard } from "./clipboard.mjs";
import { recentTasks } from "./history.mjs";
import { lastChat, redact } from "./chat.mjs";
import { collectHandoff, handoffTask, projectRoot, renderHandoff, webHandoff } from "./handoff.mjs";
import { RULES_FILES, scanProject } from "./project.mjs";
import { buildSlimPrompt, parseSlim, slimFileName } from "./slim.mjs";
import { betterPrompt, openEnded, relevantFiles, verifyCommand } from "./prompt.mjs";
import { recommend, runCommandFor } from "./recommend.mjs";
import { aiRunner, askAi, buildAiPrompt, parseAiAnswer } from "./ai.mjs";
import { startCost } from "./cost.mjs";
import { estimateTokens, heavyFiles, listProjectFiles, mcpServers, rulesCost, tokenReport } from "./tokens.mjs";
import { TEAM_FILE, readTeam, writeTeam } from "./team.mjs";
import { TOOLS, canStart, toolById } from "./tools.mjs";
import { defaultEnvironment, toolProblems } from "./detect.mjs";

// Only tools that can start get their ignore files written and counted (a settings folder alone is not a tool).
const ids = (installed) => installed.filter(canStart).map((found) => found.id);

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

// Installed tools that cannot work as set up (Gemini CLI on a personal Google login), each with what to do.
const problemsFor = (home) => (home ? toolProblems({ ...defaultEnvironment(), home }) : []);

export function checkupAction({ cwd, home, installed: detected }) {
  // The list people see (terminal, dashboard, VS Code) has only tools that can start, not a settings folder alone.
  const installed = detected.filter(canStart);
  const report = tokenReport({ dir: cwd, home, installedIds: ids(installed) });
  const project = path.basename(cwd);
  const score = setupScore({ report, installed, verify: verifyCommand(cwd) });
  const problems = problemsFor(home);
  return { text: formatCheckup({ project, installed, report, score, problems }), data: { project, installed, ...report, issues: checkupIssues(report), score, problems } };
}

/**
 * After a checkup: offers the fix right there instead of a second command. `ask(question)` resolves true for a yes.
 * Returns the text to show, or "" when there is nothing the fix can do.
 */
export async function offerFix({ cwd, home, installed, ask }) {
  const preview = fixAction({ cwd, home, installed });
  const files = [...new Set(preview.data.planned.map((p) => p.file))];
  if (!files.length) return "";
  const before = scoreAction({ cwd, home, installed }).data.score;
  if (!(await ask(`Fix it now? Your AI tools will skip ${files.length === 1 ? files[0] : `${files.length} heavy files`}; your code is not touched. (y/N) `))) {
    return "Nothing changed. Fix it later with: npx which-ai-to-use fix\n";
  }
  const applied = fixAction({ cwd, home, installed, apply: true });
  const after = scoreAction({ cwd, home, installed }).data.score;
  return `${applied.text.trimEnd().split("\n").at(-1)}\nAI setup score: ${before} → ${after}/100\n`;
}

const REPO_URL = "https://github.com/WST2002/which-ai-to-use";

/** Links that open a post with the share line already written; the user still decides whether to post. */
export function shareLinks(share) {
  const text = encodeURIComponent(`${share} ${REPO_URL}`);
  return { x: `https://x.com/intent/post?text=${text}`, linkedin: `https://www.linkedin.com/feed/?shareActive=true&text=${text}` };
}

export function scoreAction({ cwd, home, installed: detected }) {
  const installed = detected.filter(canStart);
  const report = tokenReport({ dir: cwd, home, installedIds: ids(installed) });
  const result = { ...setupScore({ report, installed, verify: verifyCommand(cwd) }) };
  result.links = shareLinks(result.share);
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
    throw new Error("AI mode needs an AI you can run from the terminal (claude, agy, gemini, codex or ollama). Install one, or use the answer without --ai.");
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
  if (!runner) throw new Error("slim needs an AI you can run from the terminal (claude, agy, gemini, codex or ollama).");
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
  const warning = limitWarning(usage, installed);
  return { text: formatUsage(usage, installed, now), data: { ...usage, tip: usageTip(usage, installed), windowText: windowLine(usage.window, now), eta: limitEta(usage), etaText: etaLine(usage), warning, tips: warning ? stretchTips(installed) : [] } };
}

/** The last 7 days of AI use next to the week before, with a line to share. */
export function reportAction({ home, now = new Date() }) {
  const report = weeklyReport({ home, now });
  const parts = [report.week.fresh && `~${shortNumber(report.week.fresh)} tokens with Claude Code`, ...report.tools.filter((t) => t.tool !== "claude-code" && t.requests).map((t) => `${t.requests} ${t.name} request${t.requests === 1 ? "" : "s"}`)].filter(Boolean);
  report.share = `My AI coding week: ${parts.join(", ") || "a quiet one"}. Tracked with which-ai-to-use: npx which-ai-to-use report`;
  report.links = shareLinks(report.share);
  return { text: formatReport(report), data: report };
}

/** Tasks asked before in this project, newest first, so one can be asked again. */
export function recentAction({ cwd, home }) {
  const tasks = recentTasks(home, cwd);
  if (!tasks.length) return { text: "No tasks asked in this project yet.\n", data: { tasks } };
  const lines = [`Recent tasks in ${path.basename(cwd)}:`, ...tasks.map((t, i) => `  ${i + 1}. ${t.task}${t.best ? `  → ${t.best}` : ""}`), "", 'Ask one again: npx which-ai-to-use "<task>"'];
  return { text: `${lines.join("\n")}\n`, data: { tasks } };
}

export function doctorAction({ cwd, home, installed }) {
  const project = scanProject(cwd);
  const problems = problemsFor(home);
  return { text: formatDoctor(installed, project, problems), data: { installed, project, problems } };
}

const WEBSITE = "https://wst2002.github.io/which-ai-to-use/";

/**
 * No AI tool on this laptop: from the task, the best AI to get, the best one with an install command, and a free
 * one, each with how to install it and the command that then starts the task.
 */
export function newcomerAction({ cwd, task, prefer = "balanced", private: forcePrivate = false }) {
  const clean = String(task ?? "").trim();
  if (!clean) throw new Error('task is empty: say what you want to do, e.g. "build a landing page"');
  const { sensitive } = scanProject(cwd);
  const files = relevantFiles(clean, listProjectFiles(cwd));
  const prompt = betterPrompt(clean, files, verifyCommand(cwd));
  const categories = classifyTask(clean);
  const rank = (tools) =>
    recommend({ task: clean, prompt, files, categories, sensitive, prefer, private: forcePrivate, installed: tools.map((tool) => ({ id: tool.id, onPath: true, via: [tool.detect.bins.length ? `command: ${tool.detect.bins[0]}` : "extension: vscode"] })) }).best;
  const option = (entry, label) => {
    const tool = toolById(entry.id);
    return { id: tool.id, name: tool.name, label, why: entry.why, free: Boolean(tool.capabilities.freeTier || tool.capabilities.local), install: tool.install ?? null, homepage: tool.homepage, command: tool.install ? entry.command : null };
  };
  const seen = new Set();
  const options = [
    [rank(TOOLS), "Best for this task"],
    [rank(TOOLS.filter((tool) => tool.install)), "Best you can install from the terminal"],
    [rank(TOOLS.filter((tool) => tool.capabilities.freeTier || tool.capabilities.local)), "Free option"],
  ].filter(([entry]) => entry && !seen.has(entry.id) && seen.add(entry.id)).map(([entry, label]) => option(entry, label));

  const lines = [`No AI coding tool was found on this laptop. For "${clean}"  →  ${categories.map((c) => LABELS[c] ?? c).join(", ")}:`, ""];
  options.forEach((o, i) => {
    lines.push(`${i + 1}. ${o.label}: ${o.name}${o.free ? " (free)" : ""}, ${o.why}.`);
    lines.push(o.install ? `   Install: ${o.install}` : `   Get it: ${o.homepage.replace(/^https:\/\//, "")}`);
    if (o.command) lines.push(`   Then:    ${o.command}`);
  });
  lines.push("", `Not into terminals? The website suggests AI apps for any task: ${WEBSITE}`);
  return { text: `${lines.join("\n")}\n`, data: { task: clean, labels: categories.map((c) => LABELS[c] ?? c), options, website: WEBSITE } };
}

/** `leftOut`: installed tools the user left out, named as left out rather than missing. */
export function recommendAction({ cwd, home, task, installed, leftOut = [], prefer = "balanced", private: forcePrivate = false }) {
  const clean = String(task ?? "").trim();
  if (!clean) throw new Error('task is empty: describe it in quotes, e.g. which-ai-to-use "fix the login bug"');
  const { sensitive } = scanProject(cwd);
  const files = relevantFiles(clean, listProjectFiles(cwd));
  const prompt = betterPrompt(clean, files, verifyCommand(cwd));
  const problems = problemsFor(home);
  const result = recommend({ task: clean, prompt, files, categories: classifyTask(clean), installed, leftOut, broken: problems.map((p) => p.id), sensitive, prefer, private: forcePrivate });
  result.notes.push(...problems.map((p) => `⚠ ${p.problem}`));
  if (result.best) {
    const name = toolById(result.best.id).name;
    const addOns = home ? mcpServers({ home, dir: cwd }).filter((server) => server.tool === name).length : 0;
    result.cost = startCost({ dir: cwd, toolId: result.best.id, files, prompt, addOns });
  }
  return { text: formatRecommendation(result), data: { ...result, asksFirst: openEnded(clean, files), labels: result.categories.map((c) => LABELS[c] ?? c) } };
}

const CONTINUE = "Read HANDOFF.md and continue the task.";
// Antigravity CLI is the free one to get, unless it is here already and its own limit is what ran out.
const noOtherAi = (leftOut) => [
  "No other AI tool is installed. To carry on:",
  "  1. Paste HANDOFF.md into ChatGPT (chatgpt.com) or Gemini (gemini.google.com) and ask it to continue.",
  leftOut.includes("antigravity-cli")
    ? `  2. Or wait until Antigravity CLI's limit resets, then run: agy -i "${CONTINUE}"`
    : `  2. Or install Antigravity CLI (free tier): ${toolById("antigravity-cli").install}, then run: agy -i "${CONTINUE}"`,
];

/** For a chat on the web, which cannot open the project: the note with the changes in it, keys hidden. */
export const webNote = (root, note) => webHandoff(root, note, redact);

/** `leftOut`: tools left out because their limit is over, named in the answer. `copy`: also put the note on the clipboard. */
/** `by`: "hook" when the Claude Code plugin writes the note after the limit was reached (VS Code reacts to that). */
export function handoffAction({ cwd, home, task: given = "", installed, leftOut: asked = [], copy = false, menu = false, by = null, prefer = "balanced", private: forcePrivate = false, date = new Date().toISOString().slice(0, 10) }) {
  // Only a tool on this laptop can be left out: with no Claude Code here, nothing says its limit is over.
  // The Claude Code plugin's hook runs inside Claude Code, so then it is here even without a claude command.
  const leftOut = asked.filter((id) => by === "hook" || installed.some((found) => found.id === id));
  const root = projectRoot(cwd);
  // The chat (in the AI whose limit ran out, or the newest one) says what was asked and where it stopped,
  // so nobody has to type the task again. Without git, the files it changed stand in for the diff.
  const chat = home ? lastChat({ home, cwd: root, from: leftOut }) : null;
  const info = collectHandoff(root, { edited: chat?.edited ?? [] });
  const file = path.join(info.root, "HANDOFF.md");
  // Writing the note again (hand back, another limit hit) keeps the task the user typed the first time.
  const task = given || handoffTask(readText(file));
  // Leaving Claude because its limit is over: remember when it resets, so the work can come back to it.
  const fromClaude = leftOut.includes("claude-code");
  const resets = fromClaude && home ? (claudeUsage({ home }).window?.end ?? null) : null;
  const note = renderHandoff({ task, info, verify: verifyCommand(info.root), date, chat, from: fromClaude ? "claude-code" : null, resets, by });
  fs.writeFileSync(file, note);
  const web = webNote(info.root, note);
  const { next, choices } = planNext({ root: info.root, task, chat, installed, leftOut, broken: problemsFor(home).map((p) => p.id), prefer, forcePrivate });
  const lines = [];
  if (chat) lines.push(`Read the ${chat.name} chat: "${chat.task.length > 70 ? `${chat.task.slice(0, 69)}…` : chat.task}" (${chat.requests} request${chat.requests === 1 ? "" : "s"}).`);
  if (info.git) lines.push(`Wrote HANDOFF.md: ${info.changes.length} changed file(s), ${info.commits.length} commit(s) on ${info.branch}.`, "");
  else if (chat) lines.push(`Wrote HANDOFF.md: ${info.changes.length} file(s) changed in the ${chat.name} chat (this folder has no git).`, "");
  else lines.push(`Wrote HANDOFF.md. This folder has no git and no AI chat was found for it${task ? "" : `, so say what you were doing: npx which-ai-to-use handoff "<task>"`}.`, "");
  if (leftOut.length) lines.push(`Left out: ${leftOut.map((id) => toolById(id).name).join(", ")} (limit over). Handing off from another AI? Add --without <tool>.`, "");
  if (resets) lines.push(`Claude's limit resets about ${resetTime(resets)}. Then hand the task back: npx which-ai-to-use handoff --back`, "");
  if (!menu) {
    if (next.best) lines.push(`Next:    ${next.best.name} — ${next.best.reason}`, `Run:     ${next.best.command}`);
    else lines.push(...noOtherAi(leftOut));
  }
  if (copy) {
    lines.push("", copyTextToClipboard(web) ? "Copied HANDOFF.md with the changes to your clipboard: paste it into any AI chat." : "Could not reach the clipboard (no clipboard tool found): open HANDOFF.md and copy it.");
  } else if (!next.best && !menu) lines.push("", "Add --copy to put HANDOFF.md on your clipboard.");
  if (!menu) lines.push("", "HANDOFF.md is for the next AI only: don't commit it.");
  return { text: `${lines.join("\n")}\n`, data: { file: "HANDOFF.md", ...info, next, choices, freeInstall: leftOut.includes("antigravity-cli") ? null : toolById("antigravity-cli").install, note, web, chat: chat && { tool: chat.tool, name: chat.name, task: chat.task, requests: chat.requests } } };
}

function planNext({ root, task, chat, installed, leftOut, broken = [], prefer, forcePrivate }) {
  const { sensitive } = scanProject(root);
  const categories = classifyTask(task || chat?.task || "");
  const available = installed.filter((found) => !leftOut.includes(found.id));
  // Every installed AI that can be started in a terminal is a choice, not only the top few.
  const next = recommend({ task: CONTINUE, categories, installed: available, sensitive, prefer, private: forcePrivate, alsoCount: Infinity });
  return { next, choices: handoffChoices(next, installSuggestion({ installed, leftOut, broken, categories, sensitive, prefer, forcePrivate })) };
}

/** Who can carry on, without writing a note: VS Code uses it when the Claude Code plugin has already written one. */
export function nextChoices({ cwd, home, installed, leftOut = ["claude-code"], task = "" }) {
  const chat = home ? lastChat({ home, cwd, from: leftOut }) : null;
  return planNext({ root: cwd, task, chat, installed, leftOut, broken: problemsFor(home).map((p) => p.id), prefer: "balanced", forcePrivate: false }).choices;
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
    { id: "web", name: "ChatGPT or Gemini on the web", why: "HANDOFF.md and the changes are copied to your clipboard; paste them into the chat", command: null, recommended: tools.length === 0 },
    { id: "other", name: "Another AI", why: `start any AI here and tell it: ${CONTINUE}`, command: null, recommended: false },
    { id: "none", name: "Nothing now", why: "keep HANDOFF.md and decide later", command: null, recommended: false },
  ];
}

/**
 * A choice for an AI the user named that is not among the choices: an installed one left out (it carries on anyway,
 * the user asked for it), or one that can be installed (its install command, then the command that carries on).
 */
export function installChoice(id, installed = []) {
  const found = installed.find((f) => f.id === id);
  if (found) {
    const command = runCommandFor(found, CONTINUE);
    return command && !command.startsWith("Open ") ? { id, name: toolById(id).name, why: "installed", command, installed: true, recommended: false } : null;
  }
  const tool = TOOLS.find((t) => t.id === id && t.install);
  if (!tool) return null;
  const command = runCommandFor({ id: tool.id, onPath: true, via: [`command: ${tool.detect.bins[0]}`] }, CONTINUE);
  return { id: tool.id, name: tool.name, why: "not installed yet", command, install: tool.install, installed: false, recommended: false };
}

/** The best AI with an install command that is not installed (or left out), ranked for continuing the task. */
function installSuggestion({ installed, leftOut, broken, categories, sensitive, prefer, forcePrivate }) {
  const have = new Set(installed.map((found) => found.id));
  // A tool that is here but cannot work as set up (Gemini CLI on a personal Google login) is no install to suggest.
  const candidates = TOOLS.filter((tool) => tool.install && !have.has(tool.id) && !leftOut.includes(tool.id) && !broken.includes(tool.id))
    .map((tool) => ({ id: tool.id, onPath: true, via: [`command: ${tool.detect.bins[0]}`] }));
  if (!candidates.length) return null;
  const best = recommend({ task: CONTINUE, categories, installed: candidates, sensitive, prefer, private: forcePrivate }).best;
  return best && { ...best, install: toolById(best.id).install };
}

/**
 * Shares this project's heavy files with the team in .which-ai.json (committed with the code), so every teammate's
 * `fix` makes their AI tools skip the same files. `apply` writes it.
 */
export function teamAction({ cwd, apply = false }) {
  const team = readTeam(cwd);
  const listed = new Set(team?.skip ?? []);
  const adding = heavyFiles(cwd, listProjectFiles(cwd)).map((h) => h.file).filter((file) => !listed.has(file));
  const lines = [];
  if (team) lines.push(`${TEAM_FILE}: ${team.skip.length} file(s) to skip, ranking "${team.prefer}"${team.without.length ? `, leaves out ${team.without.join(", ")}` : ""}.`);
  const result = (data) => ({ text: `${lines.join("\n")}\n`, data: { file: TEAM_FILE, team, adding, written: false, ...data } });
  if (!adding.length) {
    lines.push(team ? "Every heavy file is already on the team list." : "No heavy files to share: nothing to write.");
    return result();
  }
  lines.push(`Add to the team list in ${TEAM_FILE}:`, ...adding.map((file) => `  ${file}`));
  if (!apply) return result();
  const written = writeTeam(cwd, { skip: adding });
  lines.push(`Wrote ${TEAM_FILE}. Commit it: when teammates run npx which-ai-to-use fix, their AI tools skip the same files.`);
  return result({ team: written, written: true });
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
