import fs from "node:fs";
import path from "node:path";

const MAX_TEXT = 600;
const RECENT = 3;
const MAX_FILES = 20;
// Lines Claude Code writes as user turns that are not things the user asked for.
const NOT_A_REQUEST = /^\s*(<(command-|local-command|system-reminder|bash-)|Caveat: |\[Request interrupted)/;
const SECRETS = [
  [/((?:password|passwd|secret|token|api[_-]?key|access[_-]?key)["']?\s*[:=]\s*["']?)[^\s"',]+/gi, "$1[hidden]"],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}/g, "[hidden]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "[hidden]"],
  [/\bxox[abpr]-[A-Za-z0-9-]{10,}/g, "[hidden]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[hidden]"],
  [/\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, "[hidden]"],
  [/\b[A-Fa-f0-9]{40,}\b/g, "[hidden]"],
];

/** Hides passwords, API keys and tokens that may have been typed into a chat. */
export const redact = (text) => SECRETS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);

const clip = (text) => {
  const flat = redact(text).replace(/\s+/g, " ").trim();
  return flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT - 1)}…` : flat;
};

// A message is a string or a list of blocks; only text blocks are kept (no tool calls, tool results or images).
const textOf = (content) =>
  typeof content === "string" ? content : Array.isArray(content) ? content.filter((b) => b?.type === "text").map((b) => b.text).join("\n") : "";

const samePath = (a, b) => {
  if (typeof a !== "string") return false;
  const norm = (p) => path.resolve(p).replace(/[\\/]+$/, "");
  return process.platform === "win32" ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
};

function chatFiles(home) {
  const root = path.join(home, ".claude", "projects");
  let dirs;
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return [];
  }
  return dirs
    .flatMap((dir) => {
      try {
        return fs.readdirSync(path.join(root, dir.name)).filter((n) => n.endsWith(".jsonl")).map((n) => path.join(root, dir.name, n));
      } catch {
        return [];
      }
    })
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, MAX_FILES);
}

/**
 * The latest Claude Code chat for this project, from Claude Code's own log on this laptop: the first request,
 * the latest requests and Claude's last reply, shortened and with secrets hidden. Null when there is none.
 */
export function lastClaudeChat({ home, cwd }) {
  for (const { file } of chatFiles(home)) {
    const entries = fs.readFileSync(file, "utf8").split("\n").flatMap((line) => {
      try {
        return line.trim() ? [JSON.parse(line)] : [];
      } catch {
        return [];
      }
    }).filter((e) => samePath(e.cwd, cwd));
    const asked = entries.filter((e) => e.type === "user" && !e.isMeta).map((e) => textOf(e.message?.content)).filter((t) => t.trim() && !NOT_A_REQUEST.test(t));
    if (!asked.length) continue;
    const replies = entries.filter((e) => e.type === "assistant").map((e) => textOf(e.message?.content)).filter((t) => t.trim());
    return {
      file,
      task: clip(asked[0]),
      recent: asked.slice(1).slice(-RECENT).map(clip),
      lastReply: replies.length ? clip(replies.at(-1)) : "",
      requests: asked.length,
    };
  }
  return null;
}
