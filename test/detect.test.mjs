import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectTools } from "../src/detect.mjs";

function sandbox(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  const home = path.join(root, "home");
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  const addBin = (name, platform) => {
    const file = path.join(bin, platform === "win32" ? `${name}.cmd` : name);
    fs.writeFileSync(file, "");
    fs.chmodSync(file, 0o755);
  };
  const mkdir = (...parts) => fs.mkdirSync(path.join(home, ...parts), { recursive: true });
  return { bin, home, addBin, mkdir };
}

const ids = (found) => found.map((tool) => tool.id).sort();

test("command-line tools are found on PATH", (t) => {
  const s = sandbox(t);
  s.addBin("claude", "linux");
  s.addBin("codex", "linux");
  const found = detectTools({ pathDirs: [s.bin], home: s.home, platform: "linux" });
  assert.deepEqual(ids(found), ["claude-code", "codex"]);
  assert.equal(found.find((f) => f.id === "codex").onPath, true);
});

test("Windows executables use PATHEXT-style extensions", (t) => {
  const s = sandbox(t);
  s.addBin("gemini", "win32");
  assert.deepEqual(ids(detectTools({ pathDirs: [s.bin], home: s.home, platform: "win32" })), ["gemini-cli"]);
});

test("editor extensions are found in VS Code and Cursor extension folders", (t) => {
  const s = sandbox(t);
  s.mkdir(".vscode", "extensions", "github.copilot-1.250.0");
  s.mkdir(".vscode", "extensions", "saoudrizwan.claude-dev-3.1.0");
  assert.deepEqual(ids(detectTools({ pathDirs: [], home: s.home, platform: "linux" })), ["cline", "github-copilot"]);
});

test("a settings folder without a command is reported but marked off PATH", (t) => {
  const s = sandbox(t);
  s.mkdir(".gemini");
  const [gemini] = detectTools({ pathDirs: [], home: s.home, platform: "linux" });
  assert.equal(gemini.id, "gemini-cli");
  assert.equal(gemini.onPath, false);
});

test("installed Ollama models are listed", (t) => {
  const s = sandbox(t);
  s.addBin("ollama", "linux");
  s.mkdir(".ollama", "models", "manifests", "registry.ollama.ai", "library", "qwen2.5-coder", "7b");
  s.mkdir(".ollama", "models", "manifests", "registry.ollama.ai", "library", "llama3.1", "latest");
  const [ollama] = detectTools({ pathDirs: [s.bin], home: s.home, platform: "linux" });
  assert.deepEqual(ollama.models, ["llama3.1:latest", "qwen2.5-coder:7b"]);
});

test("nothing installed returns an empty list", (t) => {
  const s = sandbox(t);
  assert.deepEqual(detectTools({ pathDirs: [s.bin], home: s.home, platform: "linux" }), []);
});
