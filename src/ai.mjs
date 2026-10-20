// AI mode: with the user's permission, ask an AI that is already installed for a smarter answer.
import { spawn } from "node:child_process";
import { TOOLS, toolById } from "./tools.mjs";

const TIMEOUT_MS = 120_000;
const hasCommand = (found) => found.via.some((v) => v.startsWith("command:"));

/**
 * How to ask each AI one question with no tools, so it can only answer in text. The question goes on
 * stdin, which avoids quoting the user's words on any shell. Local first: free and private.
 */
const RUNNERS = [
  { id: "ollama", ready: (f) => hasCommand(f) && f.models?.length, bin: "ollama", args: (f) => ["run", f.models[0]] },
  { id: "claude-code", ready: hasCommand, bin: "claude", args: () => ["-p", "--tools", "", "--strict-mcp-config", "--model", "haiku"] },
  { id: "gemini-cli", ready: hasCommand, bin: "gemini", args: () => ["-p", ""] },
  { id: "codex", ready: hasCommand, bin: "codex", args: () => ["exec", "--sandbox", "read-only", "-"] },
];

export function aiRunner(installed) {
  for (const runner of RUNNERS) {
    const found = installed.find((f) => f.id === runner.id);
    if (found && runner.ready(found)) return { id: runner.id, name: toolById(runner.id).name, bin: runner.bin, args: runner.args(found), local: runner.id === "ollama" };
  }
  return null;
}

const capabilityList = (tool) => Object.entries(tool.capabilities).filter(([, on]) => on).map(([cap]) => cap).join(", ");

/** The question for the AI: task, tool names and capabilities, file names only. Never file contents. */
export function buildAiPrompt({ task, labels, installed, files, verify, rules }) {
  return [
    "You help a developer choose which AI coding tool to use. Do not use any tools; answer from this text only.",
    "",
    `Task: ${task}`,
    `Task type (from simple rules): ${labels.join(", ")}`,
    `Installed on this laptop: ${installed.map((f) => `${f.id} (${toolById(f.id).name})`).join(", ") || "none"}`,
    "All supported tools and their features:",
    ...TOOLS.map((tool) => `- ${tool.id}: ${capabilityList(tool)}`),
    `Files whose names match the task: ${files.join(", ") || "none found"}`,
    `Test command in this project: ${verify ?? "none found"}`,
    `The rules picked: best anywhere = ${rules.overall}, best installed = ${rules.best}. Agree or improve on this.`,
    "",
    "Reply with only this JSON, nothing else:",
    '{"best_anywhere": "<tool id from the list>", "best_installed": "<tool id from the installed list>", "model": "<model to use, or empty>", "why": "<one plain sentence>", "prompt": "<a better prompt for the coding agent, under 120 words, naming the files to start with and how to check the work>", "steps": ["<short step>", "<short step>", "<short step>"]}',
  ].join("\n");
}

/** Reads the JSON answer from the AI's text and rejects anything naming tools that do not exist or are not installed. */
export function parseAiAnswer(text, { installedIds }) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const known = new Set(TOOLS.map((tool) => tool.id));
  if (!known.has(raw.best_anywhere) || !installedIds.includes(raw.best_installed)) return null;
  if (typeof raw.why !== "string" || typeof raw.prompt !== "string") return null;
  return {
    bestAnywhere: raw.best_anywhere,
    bestInstalled: raw.best_installed,
    model: typeof raw.model === "string" ? raw.model : "",
    why: raw.why.trim(),
    prompt: raw.prompt.trim(),
    steps: Array.isArray(raw.steps) ? raw.steps.filter((s) => typeof s === "string").slice(0, 6) : [],
  };
}

/** Runs the AI once with the question on stdin. Resolves with its text or an error message, never throws. */
export function askAi(runner, question, { timeoutMs = TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    // .cmd shims on Windows need a shell; the arguments are fixed, the user's words only travel on stdin.
    const windows = process.platform === "win32";
    const child = windows
      ? spawn([runner.bin, ...runner.args.map((a) => (a === "" ? '""' : a))].join(" "), { shell: true })
      : spawn(runner.bin, runner.args);
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, error: error.message, seconds: 0 });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const seconds = Math.round((Date.now() - started) / 1000);
      if (code === 0 && out.trim()) resolve({ ok: true, text: out, seconds });
      else resolve({ ok: false, error: (err || out).trim().split("\n").slice(-3).join(" ") || `exited with code ${code}`, seconds });
    });
    child.stdin.end(question);
  });
}
