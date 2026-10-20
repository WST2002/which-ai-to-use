import fs from "node:fs";
import path from "node:path";

const DAY = 24 * 60 * 60 * 1000;
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
  let found = false;

  for (const file of logFiles(path.join(home, ".claude", "projects"))) {
    found = true;
    for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
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
  return { found, today, week, projects };
}
