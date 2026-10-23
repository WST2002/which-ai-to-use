import fs from "node:fs";
import path from "node:path";

const MAX_FILES = 3;
const MIN_WORD = 4;
const STOP_WORDS = new Set([
  "the", "and", "with", "from", "into", "that", "this", "when", "then", "make", "please", "thing", "work", "works", "working",
  "update", "change", "write", "should", "would", "could", "there", "where", "what", "which", "file", "files", "code", "page",
  "karo", "kardo", "theek", "wala", "wali", "fix", "add", "bug", "test", "tests", "error", "issue", "lock", "package",
]);
const NOT_SOURCE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|.*\.lock|.*\.min\.(js|css)|.*\.map)$/i;

const words = (text) =>
  String(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= MIN_WORD && !STOP_WORDS.has(word));

const pathWords = (file) =>
  file
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Up to three files whose path shares words with the task, so the agent does not have to search the whole project. */
export function relevantFiles(task, files) {
  const wanted = words(task);
  if (!wanted.length) return [];
  const candidates = files
    .filter((file) => !NOT_SOURCE.test(file))
    .map((file) => ({ file, parts: pathWords(file), name: pathWords(path.posix.basename(file)) }));
  // A word found in few paths ("hero") says more about the right file than one found in many ("section").
  const weight = Object.fromEntries(
    wanted.map((word) => [word, Math.log(1 + candidates.length / Math.max(1, candidates.filter((c) => c.parts.includes(word)).length))]),
  );
  return candidates
    .map(({ file, parts, name }) => {
      const score = wanted.reduce((sum, word) => sum + weight[word] * (name.includes(word) ? 2 : parts.includes(word) ? 1 : 0), 0);
      return { file, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.file.length - b.file.length)
    .slice(0, MAX_FILES)
    .map((entry) => entry.file);
}

const exists = (dir, file) => fs.existsSync(path.join(dir, file));

/** The command that proves the change works in this project, or null when there is none. */
export function verifyCommand(dir) {
  if (exists(dir, "package.json")) {
    let test;
    try {
      test = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).scripts?.test;
    } catch {
      test = undefined;
    }
    if (!test || /no test specified/.test(test)) return null;
    if (exists(dir, "pnpm-lock.yaml")) return "pnpm test";
    if (exists(dir, "yarn.lock")) return "yarn test";
    if (exists(dir, "bun.lockb")) return "bun test";
    return "npm test";
  }
  if (exists(dir, "go.mod")) return "go test ./...";
  if (exists(dir, "Cargo.toml")) return "cargo test";
  if (["pytest.ini", "conftest.py"].some((file) => exists(dir, file))) return "pytest";
  if (exists(dir, "pyproject.toml") && /pytest/.test(fs.readFileSync(path.join(dir, "pyproject.toml"), "utf8"))) return "pytest";
  return null;
}

// Something new described in a few words ("make my portfolio") leaves the stack, the look and the content open.
const NEW_BUILD = /\b(make|build|create|start|banao|bana do|banana)\b[\s\S]*\b(portfolio|website|web site|site|app|resume|cv|landing page|blog|game|store|shop|bot|extension)\b|\bfrom scratch\b/i;
const ASK_FIRST = "Before writing any code, ask me which tech stack, style and content I want, and wait for my answers.";

/** A short task for something new, with no file of this project to start from: the agent should ask, not guess. */
export function openEnded(task, files) {
  return !files.length && NEW_BUILD.test(task) && task.trim().split(/\s+/).length <= 15;
}

export function betterPrompt(task, files, verify) {
  // The project's tests say nothing about a new thing that is not built yet.
  if (openEnded(task, files)) return `${task.replace(/[.\s]+$/, "")}. ${ASK_FIRST}`;
  const parts = [task];
  if (files.length) parts.push(`Start with ${files.join(", ")}.`);
  if (verify) parts.push(`When done, run ${verify} and report the result.`);
  return parts.length === 1 ? task : `${task.replace(/[.\s]+$/, "")}. ${parts.slice(1).join(" ")}`;
}
