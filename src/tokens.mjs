import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { RULES_FILES, SKIP_DIRS } from "./project.mjs";

const LARGE_RULES_TOKENS = 2000;
const MAX_WALK_DEPTH = 6;

export const estimateTokens = (text) => Math.ceil(String(text).length / 4);

function walk(root, dir = root, depth = 0) {
  if (depth > MAX_WALK_DEPTH) return [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : walk(root, full, depth + 1);
    return entry.isFile() ? [path.relative(root, full).split(path.sep).join("/")] : [];
  });
}

/** Files an AI tool can see: git's view (tracked plus untracked, minus .gitignore) or a plain walk. */
export function listProjectFiles(dir) {
  const git = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: dir, encoding: "utf8" });
  if (git.status === 0) return git.stdout.split("\0").filter((file) => file && fs.existsSync(path.join(dir, file)));
  return walk(dir);
}

function sections(text) {
  const parts = [];
  let current = { title: "(top of file)", text: "" };
  for (const line of text.split(/\r?\n/)) {
    const heading = /^#{1,3}\s+(.+)/.exec(line);
    if (heading) {
      if (current.text.trim() || current.title !== "(top of file)") parts.push(current);
      current = { title: heading[1].trim(), text: "" };
    } else {
      current.text += `${line}\n`;
    }
  }
  parts.push(current);
  return parts
    .map((part) => ({ title: part.title, tokens: estimateTokens(part.text) }))
    .sort((a, b) => b.tokens - a.tokens)
    .slice(0, 3);
}

/** Rules files are sent with every message, so their size is paid on every turn. */
export function rulesCost(dir) {
  return RULES_FILES.filter((file) => fs.existsSync(path.join(dir, file))).map((file) => {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    const tokens = estimateTokens(text);
    return { file, tokens, large: tokens > LARGE_RULES_TOKENS, sections: sections(text) };
  });
}

const HEAVY_BYTES = 100 * 1024;
const LOCKFILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "poetry.lock", "Pipfile.lock", "Cargo.lock", "composer.lock", "Gemfile.lock", "go.sum"]);
const GENERATED = /\.(min\.(js|css)|map|log|snap)$/i;

/** Files an agent may read while searching that cost many tokens and rarely help. */
export function heavyFiles(dir, files) {
  return files
    .map((file) => {
      let bytes = 0;
      try {
        bytes = fs.statSync(path.join(dir, file)).size;
      } catch {
        return null;
      }
      const heavy = bytes > HEAVY_BYTES || LOCKFILES.has(path.posix.basename(file)) || GENERATED.test(file);
      return heavy ? { file, bytes, tokens: Math.ceil(bytes / 4) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.bytes - a.bytes);
}

const IGNORE_FILES = { cursor: ".cursorignore", "gemini-cli": ".geminiignore", aider: ".aiderignore" };

/** How each installed tool can be told to skip files; tools without a project-level mechanism are left out. */
export function ignoreAdvice(files, installedIds) {
  return installedIds.flatMap((id) => {
    if (id === "claude-code") {
      const deny = JSON.stringify({ permissions: { deny: files.map((file) => `Read(./${file})`) } }, null, 2);
      return [{ id, file: ".claude/settings.json", snippet: deny }];
    }
    return IGNORE_FILES[id] ? [{ id, file: IGNORE_FILES[id], snippet: files.join("\n") }] : [];
  });
}
