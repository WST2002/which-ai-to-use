import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MAX_TEXT = 600;
const RECENT = 3;
const CORRECTIONS = 3;
// A request that corrects the AI or sets a rule ("no, the other file", "don't touch the API", "use pnpm instead").
const CORRECTION = /^\s*(?:no|nope|not\s+(?:that|this|there|those|these)|wrong|that['’]?s\s+(?:not|wrong)|don['’]?t|do\s+not|never|always|actually|undo|revert)\b|\binstead\b/i;
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

// Claude Code keeps one log per chat in ~/.claude/projects/<folder>/ (deeper folders hold sub-agent logs).
function claudeFiles(home) {
  const root = path.join(home, ".claude", "projects");
  let dirs;
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return [];
  }
  return dirs.flatMap((dir) => {
    try {
      return fs.readdirSync(path.join(root, dir.name)).filter((n) => n.endsWith(".jsonl")).map((n) => path.join(root, dir.name, n));
    } catch {
      return [];
    }
  });
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

/** Files changed since `since` (ms), newest first. A file listed a moment ago can be gone: AIs prune old chats. */
function newest(files, { since = 0, limit = MAX_FILES } = {}) {
  return files
    .flatMap((file) => {
      try {
        return [{ file, mtime: fs.statSync(file).mtimeMs }];
      } catch {
        return [];
      }
    })
    .filter((f) => f.mtime >= since)
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
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

// Claude Code tools that change a file, and where each names it.
const CLAUDE_EDITS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);

function parseClaude(text, root) {
  const entries = jsonLines(text).filter((e) => !root || inside(e.cwd, root));
  const calls = entries.filter((e) => e.type === "assistant" && Array.isArray(e.message?.content)).flatMap((e) => e.message.content.filter((b) => b?.type === "tool_use"));
  return {
    asked: entries.filter((e) => e.type === "user" && !e.isMeta).map((e) => textOf(e.message?.content)).filter((t) => t.trim() && !NOT_A_REQUEST.test(t)),
    replies: entries.filter((e) => e.type === "assistant").map((e) => textOf(e.message?.content)).filter((t) => t.trim()),
    edited: calls.filter((b) => CLAUDE_EDITS.has(b.name)).map((b) => b.input?.file_path ?? b.input?.notebook_path),
  };
}

// Codex wraps each line as { type, payload }; older versions wrote the payload on its own.
const codexText = (content) => (Array.isArray(content) ? content.filter((b) => typeof b?.text === "string").map((b) => b.text).join("\n") : typeof content === "string" ? content : "");
// Codex adds its own context (environment, AGENTS.md) as user messages in tags.
const CODEX_CONTEXT = /^\s*(<[\w_-]+>|# AGENTS\.md)/;
// Codex changes files with patches that name each one on a line like "*** Update File: src/cart.ts".
const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm;

// Every string in a value, reading JSON text as JSON first.
function stringsIn(value) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") return stringsIn(parsed);
    } catch {
      // plain text
    }
    return [value];
  }
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsIn);
  return [];
}

function parseCodex(text, root) {
  const items = jsonLines(text).map((e) => (e.payload && e.type ? { ...e.payload, line: e.type } : e));
  const meta = items.find((i) => i.line === "session_meta" || (i.cwd && !i.role));
  const folder = meta?.cwd ?? /<cwd>([^<]+)<\/cwd>/.exec(items.map((i) => codexText(i.content)).join("\n"))?.[1];
  if (root && !inside(folder, root)) return null;
  const messages = items.filter((i) => i.type === "message");
  // Tool calls carry their input as text or as JSON text; a patch inside names each file it changes.
  const callText = items.filter((i) => /_call$/.test(i.type ?? "")).flatMap((i) => [i.input, i.arguments]).flatMap(stringsIn).join("\n");
  return {
    asked: messages.filter((m) => m.role === "user").map((m) => codexText(m.content)).filter((t) => t.trim() && !CODEX_CONTEXT.test(t)),
    replies: messages.filter((m) => m.role === "assistant").map((m) => codexText(m.content)).filter((t) => t.trim()),
    edited: [...callText.matchAll(PATCH_FILE)].map((m) => m[1].trim()).map((file) => (folder ? path.resolve(folder, file) : file)),
  };
}

const geminiText = (content) => (typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => p?.text ?? "").join("\n") : "");
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

// Gemini CLI names each project's folder by the SHA-256 of the project path, and writes each chat as one JSON file.
function parseGemini(text, root, file) {
  let chat;
  try {
    chat = JSON.parse(text);
  } catch {
    return null;
  }
  if (root) {
    let real = root;
    try {
      real = fs.realpathSync.native(root);
    } catch {
      // compared as written
    }
    const hash = chat.projectHash ?? path.basename(path.dirname(path.dirname(file)));
    if (![root, path.resolve(root), real].some((p) => sha256(p) === hash)) return null;
  }
  const messages = Array.isArray(chat.messages) ? chat.messages : [];
  // Gemini CLI's file tools (write_file, replace) name the file in their arguments.
  const calls = messages.flatMap((m) => (Array.isArray(m.toolCalls) ? m.toolCalls : []));
  return {
    asked: messages.filter((m) => m.type === "user").map((m) => geminiText(m.content)).filter((t) => t.trim() && !t.trim().startsWith("/")),
    replies: messages.filter((m) => m.type === "gemini" || m.type === "model").map((m) => geminiText(m.content)).filter((t) => t.trim()),
    edited: calls.filter((c) => /write|replace|edit/i.test(c?.name ?? "")).map((c) => c.args?.file_path ?? c.args?.absolute_path ?? c.args?.path),
  };
}

/** The files an AI changed in a chat, inside the project, as project paths with / (each once, sorted). */
function editedIn(files = [], root) {
  if (!root) return [];
  const real = (p) => {
    try {
      return fs.realpathSync.native(p);
    } catch {
      return p;
    }
  };
  // The log and the project may name the same folder two ways (a symlink, as /var and /private/var on macOS).
  const within = (file) => {
    const full = path.resolve(root, file);
    for (const base of [path.resolve(root), real(path.resolve(root))]) {
      for (const candidate of [full, real(full)]) {
        const rel = path.relative(base, candidate);
        if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return rel.split(path.sep).join("/");
      }
    }
    return null;
  };
  return [...new Set(files.filter((file) => typeof file === "string" && file.trim()).map(within).filter(Boolean))].sort();
}

// Where each AI keeps its chats on this laptop, and how to read one.
const SOURCES = {
  "claude-code": { name: "Claude Code", files: claudeFiles, parse: parseClaude },
  codex: { name: "Codex CLI", files: (home) => [...walk(path.join(home, ".codex", "sessions"), (n) => n.endsWith(".jsonl"))], parse: parseCodex },
  "gemini-cli": { name: "Gemini CLI", files: (home) => [...walk(path.join(home, ".gemini", "tmp"), (n) => /^session-.*\.json$/.test(n))], parse: parseGemini },
};

/**
 * The latest chat for this project in one AI, from that AI's own log on this laptop: the first request, earlier
 * corrections, the latest requests and the AI's last reply, shortened and with secrets hidden. Null when there is none.
 */
function latest(tool, { home, cwd }) {
  const source = SOURCES[tool];
  for (const { file, mtime } of newest(source.files(home))) {
    const text = read(file);
    const chat = text && source.parse(text, cwd, file);
    if (!chat?.asked.length) continue;
    return {
      tool,
      name: source.name,
      file,
      mtime,
      task: clip(chat.asked[0]),
      recent: chat.asked.slice(1).slice(-RECENT).map(clip),
      // Corrections older than the latest requests would be lost otherwise; the newest few are kept.
      corrections: chat.asked.slice(1, -RECENT).filter((t) => CORRECTION.test(t)).slice(-CORRECTIONS).map(clip),
      lastReply: chat.replies.length ? clip(chat.replies.at(-1)) : "",
      requests: chat.asked.length,
      edited: editedIn(chat.edited, cwd),
    };
  }
  return null;
}

export const lastClaudeChat = (where) => latest("claude-code", where);
export const lastCodexChat = (where) => latest("codex", where);
export const lastGeminiChat = (where) => latest("gemini-cli", where);

/**
 * The chat the next AI should read: the one in the AI whose limit ran out (`from`), or else the newest chat for this
 * project in Claude Code, Codex CLI or Gemini CLI. Null when there is none.
 */
export function lastChat({ home, cwd, from = [] }) {
  for (const tool of from.filter((id) => SOURCES[id])) {
    const chat = latest(tool, { home, cwd });
    if (chat) return chat;
  }
  return Object.keys(SOURCES).map((tool) => latest(tool, { home, cwd })).filter(Boolean).sort((a, b) => b.mtime - a.mtime)[0] ?? null;
}

/** How much each AI was used since `since` (ms), in every project: chats and requests. Only counts are kept. */
export function chatActivity({ home, since }) {
  return Object.entries(SOURCES).map(([tool, source]) => {
    let chats = 0;
    let requests = 0;
    for (const { file } of newest(source.files(home), { since, limit: Infinity })) {
      const text = read(file);
      const asked = (text && source.parse(text, null, file)?.asked.length) || 0;
      if (asked) chats += 1;
      requests += asked;
    }
    return { tool, name: source.name, chats, requests };
  });
}
