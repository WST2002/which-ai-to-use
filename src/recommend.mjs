import { TOOLS, toolById } from "./tools.mjs";

const NEEDS = {
  "quick-edit": { inline: 3, agent: 1 },
  "multi-file-feature": { agent: 3, largeContext: 1 },
  "bug-fix": { agent: 3 },
  tests: { agent: 3 },
  refactor: { agent: 3, largeContext: 2 },
  "code-review": { agent: 2, largeContext: 1 },
  "explain-codebase": { largeContext: 3, agent: 1 },
  docs: { agent: 1, inline: 1 },
  ui: { agent: 2, inline: 1 },
  "security-sensitive": { agent: 2 },
};
const SECOND_OPINION = new Set(["security-sensitive", "refactor"]);
const PRIVACY_BONUS = 10;
const FREE_BONUS = 4;

const isCliTool = (tool) => tool.detect.bins.length > 0 && !tool.run.startsWith("Open ");
const hasCommand = (found) => found.via.some((v) => v.startsWith("command:"));

function score(tool, categories, prefer, privacy) {
  const caps = tool.capabilities;
  let total = categories.reduce(
    (sum, category) => sum + Object.entries(NEEDS[category] ?? {}).reduce((s, [cap, weight]) => s + (caps[cap] ? weight : 0), 0),
    0,
  );
  if (prefer === "free" && (caps.freeTier || caps.local)) total += FREE_BONUS;
  if (prefer === "quality") total += (caps.agent ? 1 : 0) + (caps.largeContext ? 1 : 0);
  if (privacy && caps.local) total += PRIVACY_BONUS;
  return total;
}

function reasonFor(tool, found, categories, privacy) {
  const caps = tool.capabilities;
  const parts = [];
  const inTerminal = isCliTool(tool) && hasCommand(found);
  if (caps.local) parts.push("runs locally: your code never leaves this machine");
  else if (caps.agent) parts.push(inTerminal ? "terminal agent: edits many files and runs your commands" : "agent inside your editor");
  if (caps.inline && categories.includes("quick-edit")) parts.push("fast inline edits");
  if (caps.largeContext && (categories.includes("explain-codebase") || categories.includes("refactor"))) parts.push("very large context window for whole-codebase work");
  if (caps.freeTier) parts.push("free tier");
  if (privacy && !caps.local) parts.push("sends code to a cloud service");
  return parts.join("; ");
}

const CLAUDE_MODELS = new Set(["haiku", "sonnet", "opus"]);

/** The command to start `task` in an installed tool, with a Claude Code model alias when one is given. */
export function runCommandFor(found, task, model = "") {
  const tool = toolById(found.id);
  const command = commandFor(tool, found, tool.run, task);
  // AIs often answer with a full model id ("claude-sonnet-5-5"); the CLI takes the short alias.
  const alias = [...CLAUDE_MODELS].find((name) => model.toLowerCase().includes(name));
  return tool.id === "claude-code" && hasCommand(found) && alias ? command.replace(/^claude /, `claude --model ${alias} `) : command;
}

/**
 * The task goes inside "double quotes" in a command line that may run in bash, zsh, PowerShell or cmd. Characters
 * any of them would still read there (quotes, $, `, %, !, a trailing \ and line breaks) are taken out or swapped,
 * so a task or a file name can never end the quotes or run something.
 */
export function quotedText(text) {
  return String(text)
    .replace(/[\r\n]+/g, " ")
    .replace(/["`]/g, "'")
    .replace(/[$%!]/g, "")
    .replace(/\\+$/, "");
}

function commandFor(tool, found, template, task) {
  if (!template) return null;
  const onlyExtension = isCliTool(tool) && !hasCommand(found);
  if (onlyExtension) return `Open ${tool.editorName ?? tool.name} in VS Code and ask: ${template === tool.review ? "Review my uncommitted changes for bugs" : task}`;
  const model = found.models?.[0] ?? "<model>";
  return template.replaceAll("{task}", quotedText(task)).replaceAll("<model>", model);
}

const HARD = new Set(["refactor", "security-sensitive", "explain-codebase"]);
const LIGHT = new Set(["quick-edit", "docs"]);

/** Claude Code model aliases: a small model saves usage on small edits, the strongest pays off on hard work. */
function claudeModel(categories) {
  if (categories.some((c) => HARD.has(c))) return { alias: "opus", why: "strongest model for risky or large changes" };
  const small = categories.every((c) => LIGHT.has(c)) || (categories.includes("quick-edit") && !categories.includes("multi-file-feature"));
  if (small) return { alias: "haiku", why: "small, fast model: uses far less of your limit" };
  return null;
}

// Why a tool fits each kind of task, by the capability that matters most for it (first match wins).
const WHY = {
  ui: [["inline", "shows each design change right in the editor as you go"], ["agent", "can change several components and run your dev server to check the result"]],
  "quick-edit": [["inline", "fastest for a small change: edit right where your cursor is"], ["agent", "makes the change and can check it"]],
  "bug-fix": [["agent", "can run the failing code or test, fix it and run it again"]],
  tests: [["agent", "writes the tests and runs them to prove they pass"]],
  refactor: [["largeContext", "keeps the whole module in view while restructuring"], ["agent", "moves code across files and re-runs your tests"]],
  "code-review": [["largeContext", "can read the whole change at once"], ["agent", "reads the diff and runs the tests"]],
  "explain-codebase": [["largeContext", "can read most of your project at once"], ["agent", "opens and searches files to explain them"]],
  docs: [["agent", "reads the code and writes the docs next to it"], ["inline", "writes comments right in the editor"]],
  "security-sensitive": [["agent", "makes careful changes across files; get a second AI to review"]],
  "multi-file-feature": [["agent", "builds the feature across several files and runs your commands"]],
};

function whyFor(tool, categories) {
  const caps = tool.capabilities;
  for (const category of categories) {
    const match = (WHY[category] ?? []).find(([cap]) => caps[cap]);
    if (match) return match[1];
  }
  if (caps.local) return "runs on your laptop, so your code stays private";
  return "a general coding assistant";
}

const MAX_SUGGESTED = 2;

function describe(found, categories, privacy, task) {
  const tool = toolById(found.id);
  const entry = {
    id: tool.id,
    name: tool.name,
    reason: reasonFor(tool, found, categories, privacy),
    why: whyFor(tool, categories),
    where: [
      hasCommand(found) || !isCliTool(tool) ? "installed" : "installed, in your editor",
      tool.capabilities.local ? "runs on your laptop" : tool.capabilities.freeTier ? "free tier" : "",
    ]
      .filter(Boolean)
      .join(", "),
    command: commandFor(tool, found, tool.run, task),
  };
  const model = tool.id === "claude-code" && hasCommand(found) ? claudeModel(categories) : null;
  if (model) {
    entry.command = entry.command.replace(/^claude /, `claude --model ${model.alias} `);
    entry.model = `${model.alias} — ${model.why}`;
  }
  return entry;
}

/** `alsoCount`: how many other installed tools to describe after the best one. */
export function recommend({ task, prompt = task, files = [], categories, installed, sensitive = [], prefer = "balanced", private: forcePrivate = false, alsoCount = 3 }) {
  const privacy = forcePrivate || sensitive.length > 0;
  const notes = [];
  if (privacy && sensitive.length) {
    const files = sensitive.slice(0, 3).join(", ");
    const hasLocal = installed.some((found) => toolById(found.id).capabilities.local);
    notes.push(
      hasLocal
        ? `Sensitive files found (${files}): local tools are ranked first.`
        : `Sensitive files found (${files}), but none of your AI tools run locally, so your code goes to a cloud service. For private work, install Ollama.`,
    );
  }

  if (installed.length === 0) {
    notes.push("No AI coding tools found. Free options: Gemini CLI (free tier) or Ollama (local and private).");
    return { task, categories, overall: null, best: null, also: [], free: null, reviewer: null, suggested: [], notes };
  }

  const ranked = installed
    .map((found, order) => ({ found, tool: toolById(found.id), order }))
    .map((entry) => ({ ...entry, score: score(entry.tool, categories, prefer, privacy) }))
    .sort((a, b) => b.score - a.score || a.order - b.order);

  const [top, ...rest] = ranked;
  const best = describe(top.found, categories, privacy, prompt);
  const also = rest.slice(0, alsoCount).map((entry) => describe(entry.found, categories, privacy, prompt));
  const installedIds = new Set(installed.map((found) => found.id));
  // The best fit among every supported tool, by features. On a tie an installed tool wins, so we never
  // push an install that would not help.
  const everyTool = TOOLS.map((tool, order) => ({ tool, order, score: score(tool, categories, prefer, privacy), installed: installedIds.has(tool.id) }))
    .sort((a, b) => b.score - a.score || Number(b.installed) - Number(a.installed) || a.order - b.order);
  const [winner] = everyTool;
  const overall = {
    id: winner.tool.id,
    name: winner.tool.name,
    why: whyFor(winner.tool, categories),
    homepage: winner.tool.homepage,
    installed: winner.installed,
    alsoGreat: everyTool.filter((entry) => entry !== winner && entry.score === winner.score).map((entry) => entry.tool.name),
  };
  const suggested = TOOLS.filter((tool) => !installedIds.has(tool.id))
    .map((tool) => ({ tool, score: score(tool, categories, prefer, privacy) }))
    .filter((entry) => entry.score > top.score)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTED)
    .map(({ tool }) => ({ id: tool.id, name: tool.name, why: whyFor(tool, categories), homepage: tool.homepage }));
  const freeEntry = ranked.find((entry) => entry.tool.capabilities.freeTier || entry.tool.capabilities.local);
  const free = freeEntry ? describe(freeEntry.found, categories, privacy, prompt) : null;

  let reviewer = null;
  if (categories.some((c) => SECOND_OPINION.has(c))) {
    const other = rest.find((entry) => entry.tool.review);
    if (other) {
      reviewer = { id: other.tool.id, name: other.tool.name, command: commandFor(other.tool, other.found, other.tool.review, task) };
    } else if (installed.length === 1) {
      notes.push(`${top.tool.name} is the only AI tool found, and this task is risky. A second tool (for example Gemini CLI, which has a free tier) can review the change.`);
    } else {
      notes.push("This task is risky. Install a second AI tool to get an independent review.");
    }
  }
  if (installed.length === 1 && !reviewer && !categories.some((c) => SECOND_OPINION.has(c))) {
    notes.push(`${top.tool.name} is the only AI tool found. A second tool (for example Gemini CLI, which has a free tier) lets you get second opinions.`);
  }
  if (top.tool.id === "ollama" && !top.found.models?.length) notes.push("No Ollama models installed yet. Try: ollama pull qwen2.5-coder");

  return { task, files, categories, overall, best, also, free, reviewer, suggested, notes };
}
