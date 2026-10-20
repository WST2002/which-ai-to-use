import { toolById } from "./tools.mjs";

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

function commandFor(tool, found, template, task) {
  if (!template) return null;
  const onlyExtension = isCliTool(tool) && !hasCommand(found);
  if (onlyExtension) return `Open ${tool.editorName ?? tool.name} in VS Code and ask: ${template === tool.review ? "Review my uncommitted changes for bugs" : task}`;
  const model = found.models?.[0] ?? "<model>";
  return template.replaceAll("{task}", task).replaceAll("<model>", model);
}

function describe(found, categories, privacy, task) {
  const tool = toolById(found.id);
  return { id: tool.id, name: tool.name, reason: reasonFor(tool, found, categories, privacy), command: commandFor(tool, found, tool.run, task) };
}

export function recommend({ task, categories, installed, sensitive = [], prefer = "balanced", private: forcePrivate = false }) {
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
    return { task, categories, best: null, also: [], free: null, reviewer: null, notes };
  }

  const ranked = installed
    .map((found, order) => ({ found, tool: toolById(found.id), order }))
    .map((entry) => ({ ...entry, score: score(entry.tool, categories, prefer, privacy) }))
    .sort((a, b) => b.score - a.score || a.order - b.order);

  const [top, ...rest] = ranked;
  const best = describe(top.found, categories, privacy, task);
  const also = rest.slice(0, 3).map((entry) => describe(entry.found, categories, privacy, task));
  const freeEntry = ranked.find((entry) => entry.tool.capabilities.freeTier || entry.tool.capabilities.local);
  const free = freeEntry ? describe(freeEntry.found, categories, privacy, task) : null;

  let reviewer = null;
  if (categories.some((c) => SECOND_OPINION.has(c))) {
    const other = rest.find((entry) => entry.tool.review);
    if (other) {
      reviewer = { id: other.tool.id, name: other.tool.name, command: commandFor(other.tool, other.found, other.tool.review, task) };
    } else {
      notes.push("This task is risky. Install a second AI tool to get an independent review.");
    }
  }
  if (installed.length === 1) {
    notes.push(`${top.tool.name} is the only AI tool found. A second tool (for example Gemini CLI, which has a free tier) lets you get second opinions.`);
  }
  if (top.tool.id === "ollama" && !top.found.models?.length) notes.push("No Ollama models installed yet. Try: ollama pull qwen2.5-coder");

  return { task, categories, best, also, free, reviewer, notes };
}
