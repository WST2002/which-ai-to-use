import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MAX_TEXT = 600;
const RECENT = 3;
const MAX_FILES = 20;
// Lines Claude Code writes as user turns that are not things the user asked for.
const NOT_A_REQUEST = /^\s*(<(command-|local-command|system-reminder|bash-)|Caveat: |\[Request interrupted)/;
const SECRETS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, "[hidden]"],
  [/((?:password|passwd|secret|token|api[_-]?key|access[_-]?key)["']?\s*[:=]\s*["']?)[^\s"',]+/gi, "$1[hidden]"],
  [/\b((?:password|passwd|pwd|passcode|pin)\s+(?:is|was)\s+)\S+/gi, "$1[hidden]"],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, "$1 [hidden]"],
  [/(\/\/[^:/\s@]+:)[^@\s/]+@/g, "$1[hidden]@"],
  [/\b(?:sk|pk|rk)[-_](?:live_|test_)?[A-Za-z0-9_-]{16,}/g, "[hidden]"],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, "[hidden]"],
  [/\bnpm_[A-Za-z0-9]{30,}/g, "[hidden]"],
  [/\bglpat-[A-Za-z0-9_-]{20,}/g, "[hidden]"],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}/g, "[hidden]"],
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

// The same folder can be written several ways: through a symlink (/var and /private/var on macOS) or with
// Windows short names (RUNNER~1). The real path settles it; a folder that no longer exists is compared as written.
const realPaths = new Map();
function realPath(p) {
  if (!realPaths.has(p)) {
    let real;
    try {
      real = fs.realpathSync.native(p);
    } catch {
      real = path.resolve(p);
    }
    real = real.replace(/[\\/]+$/, "");
    realPaths.set(p, process.platform === "win32" ? real.toLowerCase() : real);
  }
  return realPaths.get(p);
}

// A chat started in a subfolder of the project (packages/web) is still about the project.
const inside = (folder, root) => {
  if (typeof folder !== "string") return false;
  const [child, parent] = [realPath(folder), realPath(root)];
  return child === parent || child.startsWith(`${parent}${path.sep}`) || child.startsWith(`${parent}/`);
};

function chatFiles(home) {
  const root = path.join(home, ".claude", "projects");
  let dirs;
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return [];
  }
  return newest(dirs.flatMap((dir) => {
    try {
      return fs.readdirSync(path.join(root, dir.name)).filter((n) => n.endsWith(".jsonl")).map((n) => path.join(root, dir.name, n));
    } catch {
      return [];
    }
  }));
}

/**
 * The latest Claude Code chat for this project, from Claude Code's own log on this laptop: the first request,
 * the latest requests and Claude's last reply, shortened and with secrets hidden. Null when there is none.
 */
export function lastClaudeChat({ home, cwd }) {
  for (const { file } of chatFiles(home)) {
    const text = read(file);
    if (!text) continue;
    const entries = jsonLines(text).filter((e) => inside(e.cwd, cwd));
    const asked = entries.filter((e) => e.type === "user" && !e.isMeta).map((e) => textOf(e.message?.content)).filter((t) => t.trim() && !NOT_A_REQUEST.test(t));
    if (!asked.length) continue;
    const replies = entries.filter((e) => e.type === "assistant").map((e) => textOf(e.message?.content)).filter((t) => t.trim());
    return summary("claude-code", file, asked, replies);
  }
  return null;
}

const NAMES = { "claude-code": "Claude Code", codex: "Codex CLI", "gemini-cli": "Gemini CLI" };

function summary(tool, file, asked, replies) {
  return {
    tool,
    name: NAMES[tool],
    file,
    task: clip(asked[0]),
    recent: asked.slice(1).slice(-RECENT).map(clip),
    lastReply: replies.length ? clip(replies.at(-1)) : "",
    requests: asked.length,
  };
}

function newest(files) {
  return files
    .flatMap((file) => {
      try {
        return [{ file, mtime: fs.statSync(file).mtimeMs }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, MAX_FILES);
}

function* walk(dir, match) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full, match);
    else if (match(entry.name)) yield full;
  }
}

function read(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

const jsonLines = (text) =>
  text.split("\n").flatMap((line) => {
    try {
      return line.trim() ? [JSON.parse(line)] : [];
    } catch {
      return [];
    }
  });

// Codex wraps each line as { type, payload }; older versions wrote the payload on its own.
const codexText = (content) => (Array.isArray(content) ? content.filter((b) => typeof b?.text === "string").map((b) => b.text).join("\n") : typeof content === "string" ? content : "");
// Codex adds its own context (environment, AGENTS.md) as user messages in tags.
const CODEX_CONTEXT = /^\s*(<[\w_-]+>|# AGENTS\.md)/;

/** The latest Codex CLI chat for this project, from ~/.codex/sessions on this laptop. */
export function lastCodexChat({ home, cwd }) {
  for (const { file } of newest([...walk(path.join(home, ".codex", "sessions"), (name) => name.endsWith(".jsonl"))])) {
    const text = read(file);
    if (!text) continue;
    const items = jsonLines(text).map((e) => (e.payload && e.type ? { ...e.payload, line: e.type } : e));
    const meta = items.find((i) => i.line === "session_meta" || (i.cwd && !i.role));
    const folder = meta?.cwd ?? /<cwd>([^<]+)<\/cwd>/.exec(items.map((i) => codexText(i.content)).join("\n"))?.[1];
    if (!inside(folder, cwd)) continue;
    const messages = items.filter((i) => i.type === "message");
    const asked = messages.filter((m) => m.role === "user").map((m) => codexText(m.content)).filter((t) => t.trim() && !CODEX_CONTEXT.test(t));
    if (!asked.length) continue;
    const replies = messages.filter((m) => m.role === "assistant").map((m) => codexText(m.content)).filter((t) => t.trim());
    return summary("codex", file, asked, replies);
  }
  return null;
}

const geminiText = (content) => (typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => p?.text ?? "").join("\n") : "");

/**
 * The latest Gemini CLI chat for this project, from ~/.gemini/tmp on this laptop. Gemini CLI names each project's
 * folder by the SHA-256 of the project path, and writes each chat as one JSON file.
 */
export function lastGeminiChat({ home, cwd }) {
  const hashes = new Set([cwd, path.resolve(cwd), (() => {
    try {
      return fs.realpathSync.native(cwd);
    } catch {
      return cwd;
    }
  })()].map((p) => createHash("sha256").update(p).digest("hex")));
  const files = [...walk(path.join(home, ".gemini", "tmp"), (name) => /^session-.*\.json$/.test(name))];
  for (const { file } of newest(files)) {
    const text = read(file);
    let chat;
    try {
      chat = JSON.parse(text);
    } catch {
      continue;
    }
    const hash = chat.projectHash ?? path.basename(path.dirname(path.dirname(file)));
    if (!hashes.has(hash)) continue;
    const messages = Array.isArray(chat.messages) ? chat.messages : [];
    const asked = messages.filter((m) => m.type === "user").map((m) => geminiText(m.content)).filter((t) => t.trim() && !t.trim().startsWith("/"));
    if (!asked.length) continue;
    const replies = messages.filter((m) => m.type === "gemini" || m.type === "model").map((m) => geminiText(m.content)).filter((t) => t.trim());
    return summary("gemini-cli", file, asked, replies);
  }
  return null;
}

const READERS = { "claude-code": lastClaudeChat, codex: lastCodexChat, "gemini-cli": lastGeminiChat };

/**
 * The chat the next AI should read: the one in the AI whose limit ran out (`from`), or else the newest chat for this
 * project in Claude Code, Codex CLI or Gemini CLI. Null when there is none.
 */
export function lastChat({ home, cwd, from = [] }) {
  for (const id of from) {
    const chat = READERS[id]?.({ home, cwd });
    if (chat) return chat;
  }
  const chats = Object.values(READERS).map((reader) => reader({ home, cwd })).filter(Boolean);
  const time = (chat) => {
    try {
      return fs.statSync(chat.file).mtimeMs;
    } catch {
      return 0;
    }
  };
  return chats.sort((a, b) => time(b) - time(a))[0] ?? null;
}
