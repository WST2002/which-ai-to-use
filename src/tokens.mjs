import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { RULES_FILES, SKIP_DIRS } from "./project.mjs";
import { readTeam } from "./team.mjs";

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
const NOTABLE_BYTES = 10 * 1024;
// Images, documents, fonts, media and archives are not read as text, so bytes / 4 says nothing about their cost.
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|bmp|tiff?|pdf|docx?|xlsx?|pptx?|woff2?|ttf|otf|eot|mp[34]|webm|mov|wav|ogg|zip|gz|tgz|rar|7z|jar|exe|dll|so|dylib|bin|lockb|wasm|sqlite|db)$/i;
const LOCKFILES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock", "Pipfile.lock", "Cargo.lock", "composer.lock", "Gemfile.lock", "go.sum"]);
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
      if (BINARY.test(file)) return null;
      const noisy = LOCKFILES.has(path.posix.basename(file)) || GENERATED.test(file);
      const heavy = bytes > HEAVY_BYTES || (noisy && bytes > NOTABLE_BYTES);
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

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

const normalisePath = (p) => String(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();

function claudeProjectServers(config, projectKey) {
  const entry = Object.entries(config?.projects ?? {}).find(([key]) => normalisePath(key) === normalisePath(projectKey));
  return Object.keys(entry?.[1]?.mcpServers ?? {});
}

function codexServers(home) {
  let toml = "";
  try {
    toml = fs.readFileSync(path.join(home, ".codex", "config.toml"), "utf8");
  } catch {
    return [];
  }
  return [...toml.matchAll(/^\[mcp_servers\.(?:"([^"]+)"|([\w-]+))\]/gm)].map((match) => match[1] ?? match[2]);
}

const MAX_HEAVY_LISTED = 10;

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/** True when every installed tool that can skip files already skips this one. */
function alreadySkipped(dir, file, installedIds) {
  const checks = installedIds.flatMap((id) => {
    if (id === "claude-code") {
      let deny = [];
      try {
        deny = JSON.parse(readText(path.join(dir, ".claude", "settings.json"))).permissions?.deny ?? [];
      } catch {
        deny = [];
      }
      return [deny.includes(`Read(./${file})`)];
    }
    if (!IGNORE_FILES[id]) return [];
    return [readText(path.join(dir, IGNORE_FILES[id])).split(/\r?\n/).map((line) => line.trim()).includes(file)];
  });
  return checks.length > 0 && checks.every(Boolean);
}

/** Everything `which-ai-to-use tokens` reports for a project. */
export function tokenReport({ dir, home, installedIds }) {
  const found = heavyFiles(dir, listProjectFiles(dir));
  // Files the team listed in .which-ai.json are skipped too, whatever their size.
  const team = (readTeam(dir)?.skip ?? []).filter((file) => !found.some((h) => h.file === file)).flatMap((file) => {
    try {
      const bytes = fs.statSync(path.join(dir, file)).size;
      return [{ file, bytes, tokens: Math.ceil(bytes / 4), team: true }];
    } catch {
      return [];
    }
  });
  const open = (entry) => !alreadySkipped(dir, entry.file, installedIds);
  const heavy = [...team.filter(open), ...found.filter(open).slice(0, MAX_HEAVY_LISTED)];
  return {
    rules: rulesCost(dir),
    heavy,
    ignore: heavy.length ? ignoreAdvice(heavy.map((h) => h.file), installedIds) : [],
    mcp: mcpServers({ home, dir }),
  };
}

/** MCP servers each tool loads here; every server adds its tool descriptions to each request. */
export function mcpServers({ home, dir, projectKey = dir }) {
  const claudeUser = readJson(path.join(home, ".claude.json"));
  const sources = [
    ["Claude Code", Object.keys(claudeUser?.mcpServers ?? {})],
    ["Claude Code", claudeProjectServers(claudeUser, projectKey)],
    ["Claude Code", Object.keys(readJson(path.join(dir, ".mcp.json"))?.mcpServers ?? {})],
    ["Cursor", Object.keys(readJson(path.join(home, ".cursor", "mcp.json"))?.mcpServers ?? {})],
    ["Cursor", Object.keys(readJson(path.join(dir, ".cursor", "mcp.json"))?.mcpServers ?? {})],
    ["Gemini CLI", Object.keys(readJson(path.join(home, ".gemini", "settings.json"))?.mcpServers ?? {})],
    ["Gemini CLI", Object.keys(readJson(path.join(dir, ".gemini", "settings.json"))?.mcpServers ?? {})],
    ["Codex CLI", codexServers(home)],
  ];
  const seen = new Set();
  return sources.flatMap(([tool, names]) =>
    names.filter((name) => !seen.has(`${tool}:${name}`) && seen.add(`${tool}:${name}`)).map((name) => ({ tool, name })),
  );
}
