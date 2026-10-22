import { chatActivity } from "./chat.mjs";
import { busiestProjects, claudeReplies, limitHits, total } from "./usage.mjs";

const DAY = 24 * 60 * 60 * 1000;
const WEEK = 7 * DAY;

/**
 * The last 7 days of AI use on this laptop, next to the 7 days before: Claude Code tokens per day, how often the
 * limit ran out, and how many requests went to Claude Code, Codex CLI and Gemini CLI. Numbers only, never messages.
 */
export function weeklyReport({ home, now = new Date() }) {
  const end = now.getTime();
  const { found, replies } = claudeReplies({ home, since: end - 2 * WEEK });
  const thisWeek = replies.filter((r) => r.time >= end - WEEK);
  const before = total(replies.filter((r) => r.time < end - WEEK));
  const week = total(thisWeek);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - i);
    const next = new Date(start);
    next.setDate(next.getDate() + 1);
    const label = start.toLocaleDateString("en-GB", { weekday: "short" });
    days.push({ label, date: start.toISOString().slice(0, 10), fresh: total(thisWeek.filter((r) => r.time >= start.getTime() && r.time < next.getTime())).fresh });
  }
  const busiest = days.reduce((top, day) => (day.fresh > (top?.fresh ?? 0) ? day : top), null);
  return {
    found,
    week,
    before,
    change: before.fresh ? Math.round(((week.fresh - before.fresh) / before.fresh) * 100) : null,
    days,
    busiest,
    limits: limitHits(home).filter((time) => time >= end - WEEK).length,
    projects: busiestProjects(thisWeek, 3),
    tools: chatActivity({ home, since: end - WEEK }),
  };
}
