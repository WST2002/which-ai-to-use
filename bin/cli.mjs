#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseArgs } from "node:util";
import { startDashboard } from "../src/dashboard.mjs";
import { detectTools } from "../src/detect.mjs";
import { aiAction, checkupAction, doctorAction, fixAction, handoffAction, installChoice, newcomerAction, offerFix, recommendAction, reportAction, scoreAction, slimAction, tokensAction, usageAction } from "../src/actions.mjs";
import { formatSyncPlan } from "../src/format.mjs";
import { RULES_FILES } from "../src/project.mjs";
import { copyFileToClipboard } from "../src/clipboard.mjs";
import { findEditors, hasGlobalCommand, installExtension, installGlobal } from "../src/setup.mjs";
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
  which-ai-to-use score               Your AI setup score out of 100, what costs points, a line to share
                                      (--card opens the score card image to download and post)
  which-ai-to-use dashboard           Open all of this as buttons in your browser (localhost only)
  which-ai-to-use setup               Install it for the terminal and add the sidebar to VS Code, Cursor or Windsurf (asks first)

More:
  which-ai-to-use tokens              Token details: instructions files, heavy files, add-ons (MCP servers)
  which-ai-to-use doctor              Installed AI tools and instructions files in this project
  which-ai-to-use usage               When Claude's 5-hour window resets, tokens today and this week (numbers only, from local logs)
  which-ai-to-use report              Your AI week: tokens per day vs the week before, limit hits, requests per AI, a line to share
  which-ai-to-use slim                Ask your AI for a shorter CLAUDE.md (asks first; writes CLAUDE.slim.md, --apply to swap)
  which-ai-to-use sync                Copy AGENTS.md to every installed AI's instructions file

Options:
  --prefer balanced|free|quality      Rank free/local tools or the most capable agents first
  --private                           Rank local tools first (automatic when .env or keys are found)
  --ai                                Ask an AI you have installed for a smarter answer (asks first; sends the task and file names only)
  --without <tool>                    Leave a tool out, e.g. when its usage limit is reached (claude-code, codex, gemini-cli, ...)
  --json                              Machine-readable output
  --from <file>                       sync: source rules file (default: AGENTS.md or the first one found)
  --all                               sync: write rules files for every supported AI, not only installed ones
  --yes                               fix, sync, setup, --ai: go ahead without asking
  --copy                              handoff: also copy HANDOFF.md to the clipboard, to paste into any AI chat
  --to <tool|web|none>                handoff: who carries on, without the menu (e.g. --to gemini-cli)
  --back                              handoff: Claude's limit has reset, hand the task back to Claude Code
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

async function runDashboard(values, view = "") {
  const port = Number.parseInt(values.port, 10);
  if (!(port >= 0 && port < 65536)) throw new Error("--port must be a number between 0 and 65535");
  const dashboard = await startDashboard({ cwd: process.cwd(), home: os.homedir(), port, version });
  const url = view ? `${dashboard.url}&view=${view}` : dashboard.url;
  process.stdout.write(`Dashboard for this project: ${url}\nIt runs only on this laptop. Press Ctrl+C to stop.\n`);
  if (!values["no-open"]) openBrowser(url);
}

async function runAi(values, context, task, print) {
  const preview = await aiAction({ ...context, task });
  // --json prints only JSON: the preview (needsConsent) unless --yes allows sending.
  if (values.json && !values.yes) return print(preview);
  let consent = values.yes;
  if (!consent) {
    process.stdout.write(preview.text);
    consent = await confirm(`Ask ${preview.data.runner.name} now? (y/N) `);
    if (!consent) return void process.stdout.write("Nothing was sent. Run with --ai --yes to allow it.\n");
  }
  if (!values.json) process.stdout.write(`Asking ${preview.data.runner.name}…\n`);
  return print(await aiAction({ ...context, task, consent: true }));
}

async function runSlim(values, context, print) {
  if (values.apply) return print(await slimAction({ ...context, apply: true }));
  const preview = await slimAction(context);
  if (!preview.data.needsConsent || (values.json && !values.yes)) return print(preview);
  let consent = values.yes;
  if (!consent) {
    process.stdout.write(preview.text);
    consent = await confirm(`Send it to ${preview.data.runner.name} now? (y/N) `);
    if (!consent) return void process.stdout.write("Nothing was sent. Run slim --yes to allow it.\n");
  }
  if (!values.json) process.stdout.write(`Asking ${preview.data.runner.name} to shorten ${preview.data.target.file}…\n`);
  return print(await slimAction({ ...context, consent: true }));
}

async function runFix(values, installed, print) {
  const context = { cwd: process.cwd(), home: os.homedir(), installed };
  // --json prints what would change, or with --yes what changed.
  if (values.json) return print(fixAction({ ...context, apply: values.yes }));
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

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

// Handoff writes the note, then the recommended AI (or the one picked) carries on in this terminal.
async function runHandoff(values, options, print) {
  // --back: Claude's limit has reset, so the work goes back to Claude Code.
  const to = values.back ? "claude-code" : values.to;
  // --json only writes the note and prints it with the choices; it never starts an AI.
  if (values.json) return print(handoffAction(options));
  const choosing = Boolean(to) || process.stdin.isTTY;
  const result = handoffAction({ ...options, menu: choosing });
  if (!choosing) return print(result);
  process.stdout.write(result.text);
  const { choices } = result.data;
  let choice = choices.find((c) => c.id === to && c.installed !== false);
  if (values.back && !choice) throw new Error("--back needs Claude Code on this laptop, and it was not found");
  if (to && !choice) choice = choices.find((c) => c.id === to) ?? installChoice(to, options.installed);
  if (to && !choice) throw new Error(`--to must be one of: ${[...new Set([...choices.map((c) => c.id), ...TOOLS.filter((t) => t.install).map((t) => t.id)])].join(", ")}`);
  if (!choice) {
    const recommended = choices.findIndex((c) => c.recommended) + 1;
    process.stdout.write("Who carries on?\n");
    choices.forEach((c, i) => process.stdout.write(`  ${i + 1}. ${c.name}${c.recommended ? "  ★ recommended" : ""}: ${c.why}\n`));
    const answer = await ask(`Choose [${recommended}]: `);
    choice = answer ? choices[Number(answer) - 1] : choices[recommended - 1];
    if (!choice) throw new Error(`choose a number from 1 to ${choices.length}`);
  }
  return carryOn(choice, result.data.root, values);
}

// Runs a command in this terminal, in the project folder, and resolves with whether it succeeded.
// No AI on the laptop: what to get for this task, then offer to install one and start the task in it.
async function runNewcomer(values, context, task, print) {
  const result = newcomerAction({ ...context, task });
  if (values.json || !process.stdin.isTTY) return print(result);
  process.stdout.write(result.text);
  const installable = result.data.options.filter((o) => o.install);
  if (!installable.length) return undefined;
  process.stdout.write("\n");
  installable.forEach((o, i) => process.stdout.write(`  ${i + 1}. Install ${o.name}${o.free ? " (free)" : ""}\n`));
  process.stdout.write(`  ${installable.length + 1}. Not now\n`);
  const choice = installable[Number(await ask(`Install one now? [${installable.length + 1}]: `)) - 1];
  if (!choice) return undefined;
  if (!(await runHere(choice.install, context.cwd))) return void process.stdout.write(`Installing ${choice.name} failed. Install it yourself: ${choice.install}\n`);
  process.stdout.write(`Starting ${choice.name}: ${choice.command}\n`);
  return runHere(choice.command, context.cwd);
}

function runHere(command, root) {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd: root, stdio: "inherit", shell: true });
    child.on("error", (error) => {
      process.stdout.write(`Could not run it (${error.message}). Run it yourself: ${command}\n`);
      resolve(false);
    });
    child.on("exit", (code) => resolve(code === 0));
  });
}

async function carryOn(choice, root, values) {
  if (choice.id === "none") return void process.stdout.write("HANDOFF.md is ready. It is for the next AI only: don't commit it.\n");
  if (choice.id === "web") {
    const copied = copyFileToClipboard(path.join(root, "HANDOFF.md"));
    return void process.stdout.write(`${copied ? "Copied HANDOFF.md." : "Open HANDOFF.md and copy it."} Paste it into chatgpt.com or gemini.google.com and ask it to continue.\n`);
  }
  if (choice.id === "other") {
    // Any AI we do not know: the user types the command that starts it, in their own terminal.
    const command = process.stdin.isTTY ? await ask("Command that starts your AI (e.g. qwen, goose): ") : "";
    if (!command) return void process.stdout.write(`Start your AI in this folder and tell it: "Read HANDOFF.md and continue the task."\n`);
    process.stdout.write(`When it opens, tell it: "Read HANDOFF.md and continue the task."\n`);
    return void (await runHere(command, root));
  }
  if (!choice.installed) {
    const yes = values.yes || (process.stdin.isTTY && /^y(es)?$/i.test(await ask(`${choice.name} is not installed. Install it now with "${choice.install}"? (y/N) `)));
    if (!yes) return void process.stdout.write(`Install ${choice.name} with: ${choice.install}\nThen run: ${choice.command}\n`);
    if (!(await runHere(choice.install, root))) return void process.stdout.write(`Installing ${choice.name} failed. Install it yourself: ${choice.install}\n`);
  }
  process.stdout.write(`Starting ${choice.name}: ${choice.command}\n`);
  // The command comes from data/tools.json with a fixed prompt; the user's words are only in HANDOFF.md.
  await runHere(choice.command, root);
}

const SOURCE = { store: "from its extension store", bundled: "from the copy inside this package" };

// One command for both places: the terminal command (a global npm install) and the editor sidebar.
async function runSetup(values) {
  const say = (line) => process.stdout.write(`${line}\n`);
  const ask = (question) => (values.yes ? Promise.resolve(true) : confirm(`${question} (y/N) `));
  let skipped = false;

  if (hasGlobalCommand()) say("✓ Terminal: which-ai-to-use is already installed.");
  else if (await ask("Install which-ai-to-use for the terminal (npm install -g), so it works in any project without npx?")) {
    say(installGlobal(version) ? "✓ Terminal: installed. Run which-ai-to-use in any project." : "✗ Terminal: npm install -g failed. Try it yourself: npm i -g which-ai-to-use");
  } else skipped = true;

  const editors = findEditors();
  if (!editors.length) {
    say("No VS Code, Cursor or Windsurf command found. In VS Code: Ctrl+Shift+P → \"Shell Command: Install 'code' command in PATH\" (macOS),");
    say("or search \"Which AI to Use\" in the Extensions view.");
  }
  for (const editor of editors) {
    if (!(await ask(`Add the Which AI sidebar to ${editor.name}?`))) {
      skipped = true;
      continue;
    }
    const source = installExtension(editor);
    say(source ? `✓ ${editor.name}: installed ${SOURCE[source]}. Click the ✦ Which AI icon on the left.` : `✗ ${editor.name}: could not install the extension. Search "Which AI to Use" in its Extensions view.`);
  }
  if (skipped && !process.stdin.isTTY) say("Nothing was installed without a yes. Run with --yes to install without asking.");
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
      copy: { type: "boolean", default: false },
      to: { type: "string" },
      back: { type: "boolean", default: false },
      card: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
      version: { type: "boolean", default: false },
      without: { type: "string", multiple: true, default: [] },
      "no-open": { type: "boolean", default: false },
      ai: { type: "boolean", default: false },
      apply: { type: "boolean", default: false },
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
  const noAiFound = installed.length === 0 && skipped.length === 0;
  if (!command) {
    print(checkupAction(context));
    if (values.json || !process.stdin.isTTY) return undefined;
    // Nothing installed yet: ask what they want to do and suggest an AI for it, instead of stopping here.
    if (noAiFound) {
      const task = await ask("What do you want to do with AI? (e.g. build a landing page; Enter to skip): ");
      return task ? runNewcomer(values, context, task, print) : undefined;
    }
    // Otherwise offer the fix right away, so nobody has to run a second command.
    return void process.stdout.write(await offerFix({ ...context, ask: (question) => confirm(question) }));
  }
  if (command === "dashboard") return runDashboard(values);
  if (command === "setup") return runSetup(values);
  if (command === "doctor") return print(doctorAction(context));
  if (command === "tokens") return print(tokensAction(context));
  if (command === "usage") return print(usageAction(context));
  if (command === "report") return print(reportAction(context));
  if (command === "score") return values.card ? runDashboard(values, "score") : print(scoreAction(context));
  if (command === "slim") return runSlim(values, context, print);
  // Handoff is for when Claude's limit is over, so Claude Code is left out unless --without names another tool.
  if (command === "handoff") return runHandoff(values, { ...context, task: positionals.slice(1).join(" ").trim(), leftOut: skipped.length || values.back ? [] : ["claude-code"], copy: values.copy, by: process.env.WHICH_AI_TO_USE_BY === "hook" ? "hook" : null }, print);
  if (command === "sync") return runSync(values, installed);
  if (command === "fix") return runFix(values, installed, print);
  if (values.ai) return runAi(values, context, positionals.join(" "), print);
  if (noAiFound) return runNewcomer(values, context, positionals.join(" "), print);
  return print(recommendAction({ ...context, task: positionals.join(" ") }));
}

main().catch((error) => {
  process.stderr.write(`which-ai-to-use: ${error.message}\n`);
  process.exitCode = 1;
});
