#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import fs from "node:fs";
import os from "node:os";
import { parseArgs } from "node:util";
import { startDashboard } from "../src/dashboard.mjs";
import { detectTools } from "../src/detect.mjs";
import { checkupAction, doctorAction, fixAction, handoffAction, recommendAction, tokensAction, usageAction } from "../src/actions.mjs";
import { formatSyncPlan } from "../src/format.mjs";
import { RULES_FILES } from "../src/project.mjs";
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
  which-ai-to-use dashboard           Open all of this as buttons in your browser (localhost only)

More:
  which-ai-to-use tokens              Token details: instructions files, heavy files, add-ons (MCP servers)
  which-ai-to-use doctor              Installed AI tools and instructions files in this project
  which-ai-to-use usage               Claude Code tokens used today and this week (numbers only, from local logs)
  which-ai-to-use sync                Copy AGENTS.md to every installed AI's instructions file

Options:
  --prefer balanced|free|quality      Rank free/local tools or the most capable agents first
  --private                           Rank local tools first (automatic when .env or keys are found)
  --without <tool>                    Leave a tool out, e.g. when its usage limit is reached (claude-code, codex, gemini-cli, ...)
  --json                              Machine-readable output
  --from <file>                       sync: source rules file (default: AGENTS.md or the first one found)
  --all                               sync: write rules files for every supported AI, not only installed ones
  --yes                               fix, sync: apply without asking
  --port <n>, --no-open               dashboard: fixed port, don't open the browser
  --version, --help

Made by Wageesha Tripathi — https://github.com/WST2002/which-ai-to-use
`;

function openBrowser(url) {
  const [command, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
}

async function runDashboard(values) {
  const port = Number.parseInt(values.port, 10);
  if (!(port >= 0 && port < 65536)) throw new Error("--port must be a number between 0 and 65535");
  const dashboard = await startDashboard({ cwd: process.cwd(), home: os.homedir(), port, version });
  process.stdout.write(`Dashboard for this project: ${dashboard.url}\nIt runs only on this laptop. Press Ctrl+C to stop.\n`);
  if (!values["no-open"]) openBrowser(dashboard.url);
}

async function runFix(values, installed) {
  const context = { cwd: process.cwd(), home: os.homedir(), installed };
  const preview = fixAction(context);
  process.stdout.write(preview.text);
  if (!preview.data.planned.length) return;
  const approved = values.yes || (await confirm("Apply these changes? (y/N) "));
  if (!approved) return void process.stdout.write("Nothing changed. Run again with --yes to apply.\n");
  const result = fixAction({ ...context, apply: true });
  process.stdout.write(`${result.text.trimEnd().split("\n").at(-1)}\n`);
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
      "no-open": { type: "boolean", default: false },
      port: { type: "string", default: "0" },
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
  const context = { cwd: process.cwd(), home: os.homedir(), installed, prefer: values.prefer, private: values.private };
  const print = ({ text, data }) => process.stdout.write(values.json ? `${JSON.stringify(data, null, 2)}\n` : text);
  if (!command) return print(checkupAction(context));
  if (command === "dashboard") return runDashboard(values);
  if (command === "doctor") return print(doctorAction(context));
  if (command === "tokens") return print(tokensAction(context));
  if (command === "usage") return print(usageAction(context));
  if (command === "handoff") return print(handoffAction({ ...context, task: positionals.slice(1).join(" ").trim() }));
  if (command === "sync") return runSync(values, installed);
  if (command === "fix") return runFix(values, installed);
  return print(recommendAction({ ...context, task: positionals.join(" ") }));
}

main().catch((error) => {
  process.stderr.write(`which-ai-to-use: ${error.message}\n`);
  process.exitCode = 1;
});
