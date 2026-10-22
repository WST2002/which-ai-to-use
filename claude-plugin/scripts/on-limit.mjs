// Claude Code StopFailure hook: when a turn ends because Claude's usage limit was reached, record it, write
// HANDOFF.md (copied to the clipboard) with which-ai-to-use, and show a desktop notification. Claude Code ignores
// this hook's output, so the notification is the only way to tell the user.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LIMIT = /usage limit|limit reached|rate limit|out of (?:extra )?usage|hit your limit/i;
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

function handoff(cwd) {
  const inGit = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd, encoding: "utf8" }).stdout?.trim() === "true";
  if (!inGit) return false;
  const command = onPath("which-ai-to-use") ? "which-ai-to-use" : "npx -y which-ai-to-use@latest";
  const result = spawnSync(`${command} handoff --to none --copy`, { cwd, shell: true, input: "", stdio: ["pipe", "ignore", "ignore"], timeout: 150000 });
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
  if (input.error !== "rate_limit" && !LIMIT.test(String(input.last_assistant_message ?? ""))) return;
  record(input);
  const written = handoff(input.cwd ?? process.cwd());
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
