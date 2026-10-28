import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const HANDOFF_FILE = "HANDOFF.md";
const DEFAULT_BRANCHES = ["main", "master"];
const RECENT_COMMITS = 5;

function gitRaw(dir, ...args) {
  const result = spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  return result.status === 0 ? result.stdout : null;
}

const git = (dir, ...args) => gitRaw(dir, ...args)?.trim() ?? null;

const STATUS = { M: "modified", A: "new", D: "deleted", R: "renamed", "?": "new" };

function lineCount(file) {
  try {
    const text = fs.readFileSync(file, "utf8");
    return text ? text.split("\n").filter((line, i, all) => i < all.length - 1 || line).length : 0;
  } catch {
    return 0;
  }
}

const isRepo = (dir) => git(dir, "rev-parse", "--is-inside-work-tree") === "true";

/** Where HANDOFF.md goes: the top of the git repository, or the folder itself when it has no git. */
export const projectRoot = (dir) => (isRepo(dir) ? path.resolve(git(dir, "rev-parse", "--show-toplevel")) : path.resolve(dir));

/**
 * What the next AI needs to know: branch, commits made for this task, and uncommitted changes. A folder without git
 * has none of these, so `edited` (the files the AI changed, from its chat) stands in for the changes.
 */
export function collectHandoff(dir, { edited = [] } = {}) {
  if (!isRepo(dir)) {
    const root = path.resolve(dir);
    const changes = edited
      .filter((file) => file !== HANDOFF_FILE)
      .map((file) => ({ status: fs.existsSync(path.join(root, file)) ? "edited" : "deleted", file, added: null, removed: null }));
    return { root, git: false, branch: null, base: null, commits: [], changes };
  }
  const root = path.resolve(git(dir, "rev-parse", "--show-toplevel"));
  const branch = git(dir, "branch", "--show-current") || "detached HEAD";
  const base = DEFAULT_BRANCHES.find((name) => name !== branch && git(dir, "rev-parse", "--verify", "--quiet", name) !== null);
  const log = base ? git(dir, "log", "--format=%s", `${base}..HEAD`) : git(dir, "log", "--format=%s", `-${RECENT_COMMITS}`);
  const commits = log ? log.split("\n") : [];

  const numstat = new Map(
    (git(dir, "diff", "--numstat", "HEAD") ?? "")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [added, removed, file] = line.split("\t");
        return [file, { added: Number(added) || 0, removed: Number(removed) || 0 }];
      }),
  );
  // Porcelain lines start with a two-character status that may begin with a space, so they are not trimmed.
  const changes = (gitRaw(dir, "status", "--porcelain", "--untracked-files=all") ?? "")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const code = line.slice(0, 2).trim()[0];
      const file = line.slice(3).split(" -> ").pop().replace(/^"|"$/g, "");
      const counts = code === "?" ? { added: lineCount(path.join(root, file)), removed: 0 } : (numstat.get(file) ?? { added: 0, removed: 0 });
      return { status: STATUS[code] ?? "changed", file, ...counts };
    })
    // A HANDOFF.md from an earlier run is our own note, not part of the task.
    .filter((change) => change.file !== HANDOFF_FILE)
    .sort((a, b) => a.file.localeCompare(b.file));
  return { root, git: true, branch, base: base ?? null, commits, changes };
}

/** `chat`: the summary from lastChat, if the work was done in Claude Code, Codex CLI or Gemini CLI. */
export function renderHandoff({ task, info, verify, date, chat = null, from = null, resets = null, by = null }) {
  const lines = ["# Handoff", "", `Task: ${task || chat?.task || NO_TASK}`];
  const repo = info.git !== false;
  if (repo) lines.push(`Branch: ${info.branch}`);
  lines.push("");
  if (chat) {
    lines.push(`## From the ${chat.name} chat`, "", `First request: "${chat.task}"`);
    if (chat.recent.length) lines.push("", "Latest requests:", ...chat.recent.map((r) => `- "${r}"`));
    if (chat.lastReply) lines.push("", `Where ${chat.tool === "claude-code" ? "Claude" : chat.name} stopped: "${chat.lastReply}"`);
    lines.push("", `(Read from ${chat.name}'s chat log on this laptop; passwords and keys are hidden.)`, "");
  }
  if (repo) {
    lines.push(
      // On a feature branch these are the branch's own commits; on main they are only the latest ones.
      info.base ? "## Commits for this task" : `## Recent commits on ${info.branch} (not all may be for this task)`,
      "",
      ...(info.commits.length ? info.commits.map((subject) => `- ${subject}`) : ["None yet."]),
      "",
      "## Uncommitted changes",
      "",
      ...(info.changes.length
        ? info.changes.map((c) => `- ${c.status} \`${c.file}\` (+${c.added} −${c.removed})`)
        : ["No uncommitted changes."]),
      "",
    );
  } else {
    // No git: the files come from the chat, so they are only as complete as what the AI did there.
    lines.push(
      "## Files changed in the chat",
      "",
      ...(info.changes.length
        ? info.changes.map((c) => `- ${c.status} \`${c.file}\``)
        : [chat ? `${chat.name} did not change any file in this chat.` : "Unknown: this folder has no git and no AI chat was found for it."]),
      "",
      "(This folder has no git, so there are no commits or diffs to read.)",
      "",
    );
  }
  lines.push("## For the next AI", "", "1. Read the changed files above before searching the rest of the project.");
  if (verify) lines.push(`2. Run \`${verify}\` to see where things stand.`);
  lines.push(
    `${verify ? 3 : 2}. Continue the task. Do not redo work that is already ${repo ? "committed" : "done"}.`,
    `${verify ? 4 : 3}. Delete this file when the task is done.`,
    "",
    `Written by which-ai-to-use on ${date}.`,
    "",
  );
  if (from) lines.push(`<!-- which-ai-to-use: from=${from}${by ? ` by=${by}` : ""}${resets ? ` resets=${new Date(resets).toISOString()}` : ""} -->`, "");
  return lines.join("\n");
}

// A chat on the web cannot open the project, so the note it gets carries the changes themselves, within limits.
const WEB_LIMIT = 60_000;
const FILE_LIMIT = 12_000;
// Never pasted into a web chat, whatever is in them.
const PRIVATE_FILE = /(^|\/)(\.env(\..+)?|\.npmrc|.*\.(pem|key|p12|pfx)|id_(rsa|ed25519|ecdsa)(\.pub)?)$/i;

function fileText(root, file) {
  try {
    const text = fs.readFileSync(path.join(root, file), "utf8");
    if (text.includes("\0")) return null;
    return text.length > FILE_LIMIT ? `${text.slice(0, FILE_LIMIT)}\n… (cut: the file is longer)` : text;
  } catch {
    return null;
  }
}

/**
 * HANDOFF.md for an AI chat on the web (ChatGPT, Gemini), which cannot read the project: the note plus the changes
 * themselves, the git diff and new files, or without git the files changed in the chat. Private files are left out
 * and `redact` hides keys and passwords in the rest.
 */
export function webHandoff(root, note, redact) {
  const parts = []; // { title, lang, body }
  if (isRepo(root)) {
    // On a task branch: everything since it left main, committed or not. On main: the uncommitted changes.
    const branch = git(root, "branch", "--show-current");
    const base = DEFAULT_BRANCHES.find((name) => name !== branch && git(root, "rev-parse", "--verify", "--quiet", name) !== null);
    const from = (base && git(root, "merge-base", base, "HEAD")) || "HEAD";
    const diff = gitRaw(root, "diff", from, "--", ".", `:(exclude)${HANDOFF_FILE}`) ?? "";
    const kept = diff.split(/(?=^diff --git )/m).filter((part) => part.trim() && !PRIVATE_FILE.test(/^diff --git a\/(\S+)/.exec(part)?.[1] ?? "")).join("");
    if (kept.trim()) parts.push({ title: "", lang: "diff", body: kept });
    const added = (gitRaw(root, "ls-files", "--others", "--exclude-standard") ?? "").split("\n").filter((file) => file && file !== HANDOFF_FILE && !PRIVATE_FILE.test(file));
    for (const file of added) {
      const text = fileText(root, file);
      if (text !== null) parts.push({ title: `New file \`${file}\`:`, lang: "", body: text });
    }
  } else {
    const files = [...note.matchAll(/^- (?:edited|new|modified) `(.+)`$/gm)].map((match) => match[1]).filter((file) => !PRIVATE_FILE.test(file));
    for (const file of files) {
      const text = fileText(root, file);
      if (text !== null) parts.push({ title: `\`${file}\`:`, lang: "", body: text });
    }
  }
  if (!parts.length) return note;
  // Whole parts until the limit, so no code block is cut open; a first part that alone is too long is shortened.
  const shown = [];
  let size = 0;
  for (const part of parts) {
    const body = redact(part.body).trimEnd();
    const room = WEB_LIMIT - size;
    if (body.length > room && shown.length) break;
    const text = body.length > room ? `${body.slice(0, room)}\n… (cut: it is longer)` : body;
    // A fence longer than any run of backticks inside, so a file with its own code blocks cannot end it early.
    const fence = "`".repeat(Math.max(3, ...[...text.matchAll(/`{3,}/g)].map((m) => m[0].length + 1)));
    shown.push(`${part.title ? `${part.title}\n\n` : ""}${fence}${part.lang}\n${text}\n${fence}`);
    size += text.length;
  }
  const cut = shown.length < parts.length ? "\n\n… (cut here to keep this short: ask me for any file you need)" : "";
  return `${note.trimEnd()}\n\n## The changes (you cannot open the project, so here they are)\n\n${shown.join("\n\n")}${cut}\n`;
}

const NO_TASK = "not given (ask the user)";
const META = /<!-- which-ai-to-use: from=([\w-]+)(?: by=([\w-]+))?(?: resets=(\S+))? -->/;

/**
 * From a HANDOFF.md text: which AI the note was handed off from, who wrote it ("hook" when the Claude Code plugin
 * did, after the limit was reached) and when the limit resets (ms).
 */
export function handoffMeta(text) {
  const match = META.exec(text ?? "");
  return match ? { from: match[1], by: match[2] ?? null, resets: match[3] ? Date.parse(match[3]) : null } : null;
}

/** The task written in an earlier HANDOFF.md, so writing the note again (hand back, another limit hit) keeps it. */
export function handoffTask(text) {
  const task = /^Task: (.+)$/m.exec(text ?? "")?.[1]?.trim();
  return task && task !== NO_TASK ? task : "";
}
