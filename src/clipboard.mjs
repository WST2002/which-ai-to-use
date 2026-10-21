import { spawnSync } from "node:child_process";
import fs from "node:fs";

// Each command reads the text from stdin, except on Windows, where PowerShell reads the file itself so that
// non-ASCII characters survive (its stdin uses the console code page).
const COMMANDS = {
  win32: (file) => [["powershell", ["-NoProfile", "-NonInteractive", "-Command", "Set-Clipboard -Value (Get-Content -Raw -Encoding UTF8 -LiteralPath $env:WAITU_COPY_FILE)"]]],
  darwin: () => [["pbcopy", []]],
  linux: () => [["wl-copy", []], ["xclip", ["-selection", "clipboard"]], ["xsel", ["--clipboard", "--input"]]],
};

/** Copies a text file to the clipboard with the system's own tool. Returns the tool used, or null. */
export function copyFileToClipboard(file, platform = process.platform) {
  const text = fs.readFileSync(file, "utf8");
  for (const [command, args] of (COMMANDS[platform] ?? (() => []))(file)) {
    const result = spawnSync(command, args, {
      input: platform === "win32" ? undefined : text,
      env: { ...process.env, WAITU_COPY_FILE: file, LANG: process.env.LANG || "en_US.UTF-8" },
      stdio: ["pipe", "ignore", "ignore"],
      timeout: 5000,
    });
    if (!result.error && result.status === 0) return command;
  }
  return null;
}
