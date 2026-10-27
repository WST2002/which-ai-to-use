import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkupAction, fixAction } from "../src/actions.mjs";
import { detectTools } from "../src/detect.mjs";
import { formatCheckup } from "../src/format.mjs";
import { recommend } from "../src/recommend.mjs";
import { tokenReport } from "../src/tokens.mjs";
import { TOOLS } from "../src/tools.mjs";

// A laptop with only this tool, set up the way installing it does: its commands, settings folders and extensions.
function onlyTool(t, tool) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-one-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  const home = path.join(root, "home");
  fs.mkdirSync(bin, { recursive: true });
  for (const name of tool.detect.bins) fs.writeFileSync(path.join(bin, name), "", { mode: 0o755 });
  for (const dir of tool.detect.homeDirs) fs.mkdirSync(path.join(home, dir), { recursive: true });
  for (const id of tool.detect.extensions) fs.mkdirSync(path.join(home, ".vscode", "extensions", `${id}-1.0.0`), { recursive: true });
  const project = path.join(root, "project");
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, "package-lock.json"), "x".repeat(200000));
  return { home, project, installed: detectTools({ pathDirs: [bin], home, platform: "linux", env: {} }) };
}

// Settings folders can sit inside each other (Antigravity CLI's is inside ~/.gemini), so a tool must never be
// suggested or listed on a laptop that only has another tool.
for (const tool of TOOLS) {
  test(`with only ${tool.name} installed, only ${tool.name} is suggested and listed`, (t) => {
    const { home, project, installed } = onlyTool(t, tool);
    const result = recommend({ task: "add a login page", categories: ["multi-file-feature"], installed });
    assert.deepEqual([result.best, ...result.also].map((entry) => entry.id), [tool.id]);
    const checkup = formatCheckup({ project: "demo", installed, report: tokenReport({ dir: project, home, installedIds: installed.map((f) => f.id) }) });
    assert.ok(checkup.split("\n").includes(`Your AI tools: ${tool.name}`), checkup);
    // The dashboard and VS Code show the checkup's data, not its text.
    assert.deepEqual(checkupAction({ cwd: project, home, installed }).data.installed.map((found) => found.id), [tool.id]);
    assert.ok(!result.notes.some((note) => note.includes(`for example ${tool.name}`)), "never suggests the tool already there as a second tool");
    const fixFor = new Set(fixAction({ cwd: project, home, installed }).data.planned.map((p) => p.tool));
    assert.ok([...fixFor].every((name) => name === tool.name), `fix writes only for ${tool.name}, not ${[...fixFor]}`);
  });
}
