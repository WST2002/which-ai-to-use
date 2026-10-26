import fs from "node:fs";
import path from "node:path";
import { redact } from "./chat.mjs";

// Tasks asked on this laptop, one JSON line each (task, project folder, the AI suggested), so they can be asked again.
// They stay on this laptop; secrets in a task are hidden before it is saved, and only the newest MAX_KEPT are kept.
export const TASK_LOG = [".which-ai-to-use", "tasks.jsonl"];
const MAX_KEPT = 200;
const MAX_TASK = 300;

const samePath = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

function readLog(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  return text.split("\n").flatMap((line) => {
    try {
      const entry = JSON.parse(line);
      return typeof entry?.task === "string" && typeof entry.cwd === "string" ? [entry] : [];
    } catch {
      return [];
    }
  });
}

/** Saves a task asked in `cwd` with the AI suggested for it (`best`, a name or null). Asking it again moves it to the top. */
export function recordTask(home, { cwd, task, best = null, at = new Date() }) {
  const clean = redact(String(task ?? "").replace(/\s+/g, " ").trim()).slice(0, MAX_TASK);
  if (!home || !clean) return;
  const file = path.join(home, ...TASK_LOG);
  const same = (entry) => samePath(entry.cwd, cwd) && entry.task.toLowerCase() === clean.toLowerCase();
  const kept = readLog(file).filter((entry) => !same(entry));
  kept.push({ at: at.toISOString(), cwd, task: clean, best });
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${kept.slice(-MAX_KEPT).map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  } catch {
    // A home folder that cannot be written only means the task is not offered again; the answer still comes.
  }
}

/** The newest tasks asked in this project, newest first: [{ at, task, best }]. */
export function recentTasks(home, cwd, count = 5) {
  if (!home) return [];
  return readLog(path.join(home, ...TASK_LOG))
    .filter((entry) => samePath(entry.cwd, cwd))
    .reverse()
    .slice(0, count)
    .map(({ at, task, best }) => ({ at, task, best: best ?? null }));
}
