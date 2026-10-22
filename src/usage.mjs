import fs from "node:fs";
import path from "node:path";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WINDOW = 5 * HOUR;
const MAX_PROJECTS = 5;

function* logFiles(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* logFiles(full);
    else if (entry.name.endsWith(".jsonl")) yield full;
  }
}

const empty = () => ({ fresh: 0, cached: 0, replies: 0 });

/**
 * Claude's usage limit runs in 5-hour windows that start with the first message. Anthropic does not publish
 * the exact rules, so this is an estimate: a window starts on the hour of the first reply after the previous
 * one ended. Returns the window still open at `now`, or null.
 */
function windowsOf(replies) {
  const windows = [];
  for (const { time, fresh } of [...replies].sort((a, b) => a.time - b.time)) {
    let open = windows.at(-1);
    if (!open || time >= open.end) {
      const start = Math.floor(time / HOUR) * HOUR;
      open = { start, end: start + WINDOW, fresh: 0, replies: 0 };
      windows.push(open);
    }
    open.fresh += fresh;
    open.replies += 1;
  }
  return windows;
}

// Times Claude's limit ran out, recorded by the which-ai-to-use Claude Code plugin (one JSON line each).
export const LIMIT_LOG = [".which-ai-to-use", "limits.jsonl"];

function limitHits(home) {
  try {
    return fs.readFileSync(path.join(home, ...LIMIT_LOG), "utf8").split("\n").map((line) => {
      try {
        return Date.parse(JSON.parse(line).at);
      } catch {
        return Number.NaN;
      }
    }).filter((time) => !Number.isNaN(time));
  } catch {
    return [];
  }
}

/**
 * What a full 5-hour window looks like for this user: the tokens used in the window where the limit last ran out
 * (when the plugin recorded it), otherwise the busiest finished window of the week. Null when there is no history.
 */
function limitReference(windows, open, hits) {
  const hitWindows = hits.map((time) => windows.find((w) => w.start <= time && time < w.end)).filter(Boolean);
  if (hitWindows.length) return { tokens: hitWindows.at(-1).fresh, source: "limit" };
  const finished = windows.filter((w) => w !== open);
  return finished.length ? { tokens: Math.max(...finished.map((w) => w.fresh)), source: "busiest" } : null;
}

/**
 * Token use from Claude Code's local session logs (~/.claude/projects/**.jsonl). Only the usage numbers,
 * timestamp and folder name of each reply are read; message text is never kept or shown.
 * "fresh" = input + output + cache writes; "cached" = cache reads, which are much cheaper.
 */
export function claudeUsage({ home, now = new Date() }) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const weekStart = now.getTime() - 7 * DAY;
  const today = empty();
  const week = empty();
  const byProject = new Map();
  const seen = new Set();
  const replies = [];
  let found = false;

  for (const file of logFiles(path.join(home, ".claude", "projects"))) {
    found = true;
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue; // pruned by Claude Code since it was listed
    }
    for (const raw of text.split("\n")) {
      if (!raw.includes('"usage"')) continue;
      let entry;
      try {
        entry = JSON.parse(raw);
      } catch {
        continue;
      }
      const usage = entry.message?.usage;
      const time = Date.parse(entry.timestamp);
      if (!usage || Number.isNaN(time) || time < weekStart) continue;
      // Claude Code writes one line per content block of a reply, each with the same id and usage.
      const id = entry.message.id ?? `${file}:${entry.timestamp}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const fresh = (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
      const cached = usage.cache_read_input_tokens ?? 0;
      replies.push({ time, fresh });
      for (const bucket of time >= startOfToday.getTime() ? [today, week] : [week]) {
        bucket.fresh += fresh;
        bucket.cached += cached;
        bucket.replies += 1;
      }
      const project = path.basename(String(entry.cwd ?? "unknown").replace(/[\\/]+$/, "").replace(/\\/g, "/"));
      byProject.set(project, (byProject.get(project) ?? 0) + fresh);
    }
  }

  const projects = [...byProject].map(([project, fresh]) => ({ project, fresh })).sort((a, b) => b.fresh - a.fresh).slice(0, MAX_PROJECTS);
  const windows = windowsOf(replies);
  const last = windows.at(-1);
  const window = last && last.end > now.getTime() ? last : null;
  return { found, today, week, projects, window, limit: limitReference(windows, window, limitHits(home)) };
}
