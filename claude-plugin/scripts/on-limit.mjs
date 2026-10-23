// Claude Code StopFailure hook: when a turn ends because Claude's usage limit was reached, record it, write
// HANDOFF.md (copied to the clipboard) with which-ai-to-use, and show a desktop notification. Claude Code ignores
// this hook's output, so the notification is the only way to tell the user.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The usage limit, not a short per-minute rate limit (API keys), which Claude Code retries and which passes quickly.
const LIMIT = /usage limit|limit reached|out of (?:extra )?usage|hit your limit|limit will reset/i;
const WINDOWS = process.platform === "win32";

function onPath(bin) {
  const names = WINDOWS ? [`${bin}.cmd`, `${bin}.exe`, bin] : [bin];
  return (process.env.PATH ?? "").split(path.delimiter).some((dir) => names.some((name) => fs.existsSync(path.join(dir, name))));
}

function record(input) {
  const file = path.join(os.homedir(), ".which-ai-to-use", "limits.jsonl");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), session: input.session_id ?? null, error: input.error ?? null })}\n`);
}

const FIVE_HOURS = 5 * 60 * 60 * 1000;
const NOTE = /<!-- which-ai-to-use: from=claude-code(?: by=[\w-]+)?(?: resets=(\S+))? -->/;

function gitRoot(cwd) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

// Every message sent while the limit is over fails again; the note written for this window is already there.
function alreadyHandedOff(root) {
  const file = path.join(root, "HANDOFF.md");
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return false;
  }
  const match = NOTE.exec(text);
  if (!match) return false;
  const resets = match[1] ? Date.parse(match[1]) : Number.NaN;
  return Number.isNaN(resets) ? Date.now() - fs.statSync(file).mtimeMs < FIVE_HOURS : resets > Date.now();
}

function handoff(root) {
  const command = onPath("which-ai-to-use") ? "which-ai-to-use" : "npx -y which-ai-to-use@latest";
  const env = { ...process.env, WHICH_AI_TO_USE_BY: "hook" };
  const result = spawnSync(`${command} handoff --to none --copy`, { cwd: root, env, shell: true, input: "", stdio: ["pipe", "ignore", "ignore"], timeout: 150000 });
  return result.status === 0;
}

// Fixed texts only; they reach the OS tools through the environment, never through a command line.
function notify(title, body) {
  const env = { ...process.env, WAITU_TITLE: title, WAITU_BODY: body };
  if (WINDOWS) {
    const script = [
      "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null",
      "$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)",
      "$x = $t.GetElementsByTagName('text'); $x.Item(0).AppendChild($t.CreateTextNode($env:WAITU_TITLE)) > $null; $x.Item(1).AppendChild($t.CreateTextNode($env:WAITU_BODY)) > $null",
      "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe').Show([Windows.UI.Notifications.ToastNotification]::new($t))",
    ].join("; ");
    spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { env, stdio: "ignore", timeout: 10000 });
  } else if (process.platform === "darwin") {
    spawnSync("osascript", ["-e", "display notification (system attribute \"WAITU_BODY\") with title (system attribute \"WAITU_TITLE\")"], { env, stdio: "ignore", timeout: 10000 });
  } else spawnSync("notify-send", [title, body], { stdio: "ignore", timeout: 10000 });
}

function main() {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  if (input.hook_event_name !== "StopFailure") return;
  const message = String(input.last_assistant_message ?? "");
  if (!LIMIT.test(message) && !(input.error === "rate_limit" && !message.trim())) return;
  // The top of the git repository, or the folder Claude worked in when it has no git (the note then lists the
  // files Claude changed in the chat).
  const root = gitRoot(input.cwd ?? process.cwd()) ?? path.resolve(input.cwd ?? process.cwd());
  if (alreadyHandedOff(root)) return;
  record(input);
  const written = handoff(root);
  notify(
    "Claude's limit was reached",
    written
      ? "HANDOFF.md is ready and copied. Run: npx which-ai-to-use handoff to pick who carries on."
      : "Run: npx which-ai-to-use handoff to hand the task to another AI.",
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`which-ai-to-use limit-handoff: ${error.message}\n`);
}
