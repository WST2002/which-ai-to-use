#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import fs from "node:fs";
import { parseArgs } from "node:util";
import { classifyTask } from "../src/classify.mjs";
import { detectTools } from "../src/detect.mjs";
import { formatDoctor, formatRecommendation, formatSyncPlan } from "../src/format.mjs";
import { RULES_FILES, scanProject } from "../src/project.mjs";
import { recommend } from "../src/recommend.mjs";
import { applySync, planSync } from "../src/sync.mjs";
import { toolById } from "../src/tools.mjs";

const PREFERENCES = ["balanced", "free", "quality"];
const version = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

const HELP = `which-ai-to-use ${version} — pick the right AI coding tool for a task

Usage:
  which-ai-to-use "<task>"            Recommend which of your AI tools to use
  which-ai-to-use doctor              Show installed AI tools and this project's rules files
  which-ai-to-use sync                Copy your project rules to every installed AI's rules file

Options:
  --prefer balanced|free|quality      Rank free/local tools or the most capable agents first
  --private                           Rank local tools first (automatic when .env or keys are found)
  --json                              Machine-readable output
  --from <file>                       sync: source rules file (default: AGENTS.md or the first one found)
  --all                               sync: write rules files for every supported AI, not only installed ones
  --yes                               sync: overwrite hand-written rules files without asking
  --version, --help

Made by Wageesha Tripathi — https://github.com/WST2002/which-ai-to-use
`;

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
    },
  });
  if (values.version) return void process.stdout.write(`${version}\n`);
  if (values.help || positionals.length === 0) return void process.stdout.write(HELP);
  if (!PREFERENCES.includes(values.prefer)) throw new Error(`--prefer must be one of: ${PREFERENCES.join(", ")}`);

  const installed = detectTools();
  const [command] = positionals;
  if (command === "doctor") {
    const project = scanProject(process.cwd());
    return void process.stdout.write(values.json ? `${JSON.stringify({ installed, project }, null, 2)}\n` : formatDoctor(installed, project));
  }
  if (command === "sync") return runSync(values, installed);

  const task = positionals.join(" ");
  const { sensitive } = scanProject(process.cwd());
  const result = recommend({ task, categories: classifyTask(task), installed, sensitive, prefer: values.prefer, private: values.private });
  process.stdout.write(values.json ? `${JSON.stringify(result, null, 2)}\n` : formatRecommendation(result));
}

main().catch((error) => {
  process.stderr.write(`which-ai-to-use: ${error.message}\n`);
  process.exitCode = 1;
});
