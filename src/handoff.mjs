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

/** What the next AI needs to know: branch, commits made for this task, and uncommitted changes. */
export function collectHandoff(dir) {
  if (git(dir, "rev-parse", "--is-inside-work-tree") !== "true") {
    throw new Error("handoff needs a git repository: run it inside the project you were working on");
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
  return { root, branch, base: base ?? null, commits, changes };
}

/** `chat`: the summary from lastClaudeChat, if the work was done in Claude Code. */
export function renderHandoff({ task, info, verify, date, chat = null }) {
  const lines = [
    "# Handoff",
    "",
    `Task: ${task || chat?.task || "not given (ask the user)"}`,
    `Branch: ${info.branch}`,
    "",
  ];
  if (chat) {
    lines.push("## From the Claude Code chat", "", `First request: "${chat.task}"`);
    if (chat.recent.length) lines.push("", "Latest requests:", ...chat.recent.map((r) => `- "${r}"`));
    if (chat.lastReply) lines.push("", `Where Claude stopped: "${chat.lastReply}"`);
    lines.push("", "(Read from Claude Code's chat log on this laptop; passwords and keys are hidden.)", "");
  }
  lines.push(
    "## Commits for this task",
    "",
    ...(info.commits.length ? info.commits.map((subject) => `- ${subject}`) : ["None yet."]),
    "",
    "## Uncommitted changes",
    "",
    ...(info.changes.length
      ? info.changes.map((c) => `- ${c.status} \`${c.file}\` (+${c.added} −${c.removed})`)
      : ["No uncommitted changes."]),
    "",
    "## For the next AI",
    "",
    "1. Read the changed files above before searching the rest of the project.",
  );
  if (verify) lines.push(`2. Run \`${verify}\` to see where things stand.`);
  lines.push(
    `${verify ? 3 : 2}. Continue the task. Do not redo work that is already committed.`,
    `${verify ? 4 : 3}. Delete this file when the task is done.`,
    "",
    `Written by which-ai-to-use on ${date}.`,
    "",
  );
  return lines.join("\n");
}
