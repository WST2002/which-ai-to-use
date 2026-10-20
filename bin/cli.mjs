#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { classifyTask } from "../src/classify.mjs";
import { detectTools } from "../src/detect.mjs";
import { formatCheckup, formatDoctor, formatRecommendation, formatSyncPlan, formatTokens } from "../src/format.mjs";
import { collectHandoff, renderHandoff } from "../src/handoff.mjs";
import { applyIgnoreAdvice } from "../src/fix.mjs";
import { betterPrompt, relevantFiles, verifyCommand } from "../src/prompt.mjs";
import { listProjectFiles, tokenReport } from "../src/tokens.mjs";
import { RULES_FILES, scanProject } from "../src/project.mjs";
import { recommend } from "../src/recommend.mjs";
import { applySync, planSync } from "../src/sync.mjs";
import { TOOLS, toolById } from "../src/tools.mjs";

const PREFERENCES = ["balanced", "free", "quality"];
const version = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const HELP = `which-ai-to-use ${version} — use your AI coding tools better

Start here:
  which-ai-to-use                     Check this project: your AI tools and what wastes tokens
  which-ai-to-use "<task>"            Which AI (and model) to use for a task, with the command to run
  which-ai-to-use handoff "<task>"    Claude limit over? Write HANDOFF.md so another AI carries on
  which-ai-to-use fix                 Make your AI tools skip heavy files (asks first)

More:
  which-ai-to-use tokens              Token details: instructions files, heavy files, add-ons (MCP servers)
  which-ai-to-use doctor              Installed AI tools and instructions files in this project
  which-ai-to-use sync                Copy AGENTS.md to every installed AI's instructions file

Options:
  --prefer balanced|free|quality      Rank free/local tools or the most capable agents first
  --private                           Rank local tools first (automatic when .env or keys are found)
  --without <tool>                    Leave a tool out, e.g. when its usage limit is reached (claude-code, codex, gemini-cli, ...)
  --json                              Machine-readable output
  --from <file>                       sync: source rules file (default: AGENTS.md or the first one found)
  --all                               sync: write rules files for every supported AI, not only installed ones
  --yes                               fix, sync: apply without asking
  --version, --help

Made by Wageesha Tripathi — https://github.com/WST2002/which-ai-to-use
`;

async function runFix(values, installed) {
  const cwd = process.cwd();
  const report = tokenReport({ dir: cwd, home: os.homedir(), installedIds: installed.map((found) => found.id) });
  if (!report.ignore.length) return void process.stdout.write("Nothing to fix: no heavy files, or none of your AI tools can be told to skip files.\n");
  const lines = ["Your AI tools will skip these files:"];
  for (const advice of report.ignore) {
    const files = advice.id === "claude-code" ? report.heavy.map((h) => h.file) : advice.snippet.split("\n");
    for (const file of files) lines.push(`  ${file} → ${advice.file} (${toolById(advice.id).name})`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
  const approved = values.yes || (await confirm("Apply these changes? (y/N) "));
  if (!approved) return void process.stdout.write("Nothing changed. Run again with --yes to apply.\n");
  const changes = applyIgnoreAdvice(cwd, report.ignore);
  if (!changes.length) return void process.stdout.write("Nothing to fix: your AI tools already skip these files.\n");
  const skipped = report.ignore.length - changes.length;
  process.stdout.write(`Updated ${changes.map((c) => c.file).join(", ")}${skipped ? ` (${skipped} file skipped)` : ""}.\n`);
}

async function confirm(question) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function runSync(values, installed) {
  const cwd = process.cwd();
  const installedRules = installed.map((found) => toolById(found.id).rulesFile).filter(Boolean);
  const targets = values.all ? RULES_FILES : [...new Set(["AGENTS.md", ...installedRules])];
  const plan = planSync(cwd, { from: values.from, targets });
  process.stdout.write(formatSyncPlan(plan));
  let overwrite = values.yes;
  const differing = plan.items.filter((item) => item.status === "differs");
  if (differing.length && !overwrite) {
    overwrite = await confirm(`Overwrite ${differing.map((i) => i.file).join(", ")} with ${plan.source}? (y/N) `);
    if (!overwrite) process.stdout.write("Kept hand-written files. Re-run with --yes to overwrite them.\n");
  }
  const written = applySync(cwd, plan, { overwrite });
  process.stdout.write(written.length ? `Wrote: ${written.join(", ")}\n` : "Nothing to write.\n");
}

const CONTINUE = "Read HANDOFF.md and continue the task.";

function runHandoff(task, installed, values) {
  const cwd = process.cwd();
  const info = collectHandoff(cwd);
  const date = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(info.root, "HANDOFF.md"), renderHandoff({ task, info, verify: verifyCommand(info.root), date }));
  const { sensitive } = scanProject(info.root);
  const next = recommend({ task: CONTINUE, categories: classifyTask(task), installed, sensitive, prefer: values.prefer, private: values.private });
  if (values.json) return void process.stdout.write(`${JSON.stringify({ file: "HANDOFF.md", ...info, next }, null, 2)}\n`);
  const lines = [`Wrote HANDOFF.md: ${info.changes.length} changed file(s), ${info.commits.length} commit(s) on ${info.branch}.`, ""];
  if (next.best) lines.push(`Next:    ${next.best.name} — ${next.best.reason}`, `Run:     ${next.best.command}`);
  else lines.push(...next.notes);
  lines.push("", "HANDOFF.md is for the next AI only: don't commit it.");
  process.stdout.write(`${lines.join("\n")}\n`);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      prefer: { type: "string", default: "balanced" },
      private: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      from: { type: "string" },
      all: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
      without: { type: "string", multiple: true, default: [] },
    },
  });
  if (values.version) return void process.stdout.write(`${version}\n`);
  if (values.help) return void process.stdout.write(HELP);
  if (!PREFERENCES.includes(values.prefer)) throw new Error(`--prefer must be one of: ${PREFERENCES.join(", ")}`);

  const skipped = values.without.flatMap((value) => value.split(",")).map((id) => id.trim()).filter(Boolean);
  for (const id of skipped) {
    if (!toolById(id)) throw new Error(`unknown tool "${id}" for --without. Use one of: ${TOOLS.map((tool) => tool.id).join(", ")}`);
  }
  const installed = detectTools().filter((found) => !skipped.includes(found.id));
  const [command] = positionals;
  if (!command) {
    const cwd = process.cwd();
    const report = tokenReport({ dir: cwd, home: os.homedir(), installedIds: installed.map((found) => found.id) });
    if (values.json) return void process.stdout.write(`${JSON.stringify({ installed, ...report }, null, 2)}\n`);
    return void process.stdout.write(formatCheckup({ project: path.basename(cwd), installed, report }));
  }
  if (command === "doctor") {
    const project = scanProject(process.cwd());
    return void process.stdout.write(values.json ? `${JSON.stringify({ installed, project }, null, 2)}\n` : formatDoctor(installed, project));
  }
  if (command === "sync") return runSync(values, installed);
  if (command === "fix") return runFix(values, installed);
  if (command === "handoff") return runHandoff(positionals.slice(1).join(" ").trim(), installed, values);
  if (command === "tokens") {
    const report = tokenReport({ dir: process.cwd(), home: os.homedir(), installedIds: installed.map((found) => found.id) });
    return void process.stdout.write(values.json ? `${JSON.stringify(report, null, 2)}\n` : formatTokens(report));
  }

  const task = positionals.join(" ").trim();
  if (!task) throw new Error('task is empty: describe it in quotes, e.g. which-ai-to-use "fix the login bug"');
  const cwd = process.cwd();
  const { sensitive } = scanProject(cwd);
  const files = relevantFiles(task, listProjectFiles(cwd));
  const prompt = betterPrompt(task, files, verifyCommand(cwd));
  const result = recommend({ task, prompt, files, categories: classifyTask(task), installed, sensitive, prefer: values.prefer, private: values.private });
  process.stdout.write(values.json ? `${JSON.stringify(result, null, 2)}\n` : formatRecommendation(result));
}

main().catch((error) => {
  process.stderr.write(`which-ai-to-use: ${error.message}\n`);
  process.exitCode = 1;
});
