// Runs the extension tests in a separate, freshly downloaded VS Code (cached in .vscode-test/),
// with every other extension disabled and a throwaway project folder.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const here = path.dirname(fileURLToPath(import.meta.url));
const project = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-vscode-"));
fs.mkdirSync(path.join(project, "src", "components"), { recursive: true });
fs.writeFileSync(path.join(project, "package-lock.json"), "x".repeat(40 * 1024));
fs.writeFileSync(path.join(project, "src", "components", "Hero.tsx"), "export default function Hero() {}\n");
// A stand-in `claude` on PATH, so the tests see the same installed tool on every machine and in CI.
const bin = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-vscode-bin-"));
const claude = path.join(bin, process.platform === "win32" ? "claude.cmd" : "claude");
fs.writeFileSync(claude, "");
fs.chmodSync(claude, 0o755);
for (const args of [["init", "-q", "-b", "main"], ["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "--allow-empty", "-m", "start"]]) {
  spawnSync("git", args, { cwd: project });
}

try {
  await runTests({
    extensionDevelopmentPath: path.resolve(here, ".."),
    extensionTestsPath: path.join(here, "suite.cjs"),
    launchArgs: [project, "--disable-extensions", "--skip-welcome", "--skip-release-notes"],
    extensionTestsEnv: { PATH: [bin, process.env.PATH].join(path.delimiter) },
  });
  console.log("All extension tests passed.");
} catch (error) {
  console.error(`Extension tests failed: ${error.message ?? error}`);
  process.exitCode = 1;
} finally {
  fs.rmSync(project, { recursive: true, force: true });
  fs.rmSync(bin, { recursive: true, force: true });
}
