import fs from "node:fs";
import path from "node:path";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WINDOW = 5 * HOUR;
const MAX_PROJECTS = 5;
// The pace is read from the replies of the last half hour; one reply, or a few minutes, says nothing about it.
const PACE_SPAN = 30 * 60 * 1000;
const MIN_PACE_SPAN = 5 * 60 * 1000;
const MIN_PACE_REPLIES = 2;

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

/** Times (ms) the plugin recorded Claude's limit running out. */
export function limitHits(home) {
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
 * Tokens per minute in the open window over the last half hour, or null when there is too little to go on
 * (no open window, fewer than two recent replies, or nothing in the last half hour: the user is taking a break).
 */
function paceOf(replies, window, now) {
  if (!window) return null;
  const from = Math.max(window.start, now - PACE_SPAN);
  const recent = replies.filter((r) => r.time >= from && r.time <= now);
  if (recent.length < MIN_PACE_REPLIES) return null;
  const minutes = Math.max(now - from, MIN_PACE_SPAN) / 60000;
  return { perMinute: recent.reduce((sum, r) => sum + r.fresh, 0) / minutes, at: now };
}

/**
 * Every Claude Code reply since `since` (ms), from its local session logs (~/.claude/projects/**.jsonl): only the
 * usage numbers, time and folder name are read; message text is never kept or shown.
 * "fresh" = input + output + cache writes; "cached" = cache reads, which are much cheaper.
 */
export function claudeReplies({ home, since }) {
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
      if (!usage || Number.isNaN(time) || time < since) continue;
      // Claude Code writes one line per content block of a reply, each with the same id and usage.
      const id = entry.message.id ?? `${file}:${entry.timestamp}`;
      if (seen.has(id)) continue;
      seen.add(id);
      replies.push({
        time,
        fresh: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0),
        cached: usage.cache_read_input_tokens ?? 0,
        project: path.basename(String(entry.cwd ?? "unknown").replace(/[\\/]+$/, "").replace(/\\/g, "/")),
      });
    }
  }
  return { found, replies };
}

/** Adds up replies: tokens, cache re-reads and reply count. */
export function total(replies) {
  return replies.reduce((sum, r) => ({ fresh: sum.fresh + r.fresh, cached: sum.cached + r.cached, replies: sum.replies + 1 }), empty());
}

/** The projects that used the most tokens, busiest first. */
export function busiestProjects(replies, count = MAX_PROJECTS) {
  const byProject = new Map();
  for (const r of replies) byProject.set(r.project, (byProject.get(r.project) ?? 0) + r.fresh);
  return [...byProject].map(([project, fresh]) => ({ project, fresh })).sort((a, b) => b.fresh - a.fresh).slice(0, count);
}

/** Claude Code usage today and over the last 7 days, the open 5-hour window, its pace and what a full window looks like. */
export function claudeUsage({ home, now = new Date() }) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const { found, replies } = claudeReplies({ home, since: now.getTime() - 7 * DAY });
  const windows = windowsOf(replies);
  const last = windows.at(-1);
  const window = last && last.end > now.getTime() ? last : null;
  return {
    found,
    today: total(replies.filter((r) => r.time >= startOfToday.getTime())),
    week: total(replies),
    projects: busiestProjects(replies),
    window,
    pace: paceOf(replies, window, now.getTime()),
    limit: limitReference(windows, window, limitHits(home)),
  };
}
