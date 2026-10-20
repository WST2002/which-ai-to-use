import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { slimAction } from "../src/actions.mjs";
import { buildSlimPrompt, parseSlim } from "../src/slim.mjs";

const installed = [{ id: "claude-code", name: "Claude Code", onPath: true, via: ["command: claude"] }];
const LONG = `# Rules\n${"- Always run npm test before you commit. Keep components small.\n".repeat(200)}`;

function project(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-slim-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}
const reply = (text) => async () => ({ ok: true, text, seconds: 5 });

test("the slim prompt keeps rules, commands and paths, and asks for the file between markers", () => {
  const prompt = buildSlimPrompt("CLAUDE.md", "# Rules\nRun `npm test`.");
  assert.match(prompt, /Keep every rule, command, path/);
  assert.match(prompt, /<<<FILE/);
  assert.match(prompt, /Run `npm test`\./);
});

test("only a clearly shorter file between the markers is accepted", () => {
  assert.equal(parseSlim("Here you go:\n<<<FILE\n# Rules\nRun npm test.\nFILE>>>\nDone", LONG), "# Rules\nRun npm test.\n");
  assert.equal(parseSlim("# Rules", LONG), null);
  assert.equal(parseSlim(`<<<FILE\n${LONG}\nFILE>>>`, LONG), null);
  assert.equal(parseSlim("<<<FILE\n\nFILE>>>", LONG), null);
});

test("slim asks first, writes CLAUDE.slim.md without touching CLAUDE.md, and --apply keeps a backup", async (t) => {
  const dir = project(t, { "CLAUDE.md": LONG });
  const preview = await slimAction({ cwd: dir, installed, ask: reply("unused") });
  assert.equal(preview.data.needsConsent, true);
  assert.match(preview.text, /the full text of CLAUDE\.md/);

  const done = await slimAction({ cwd: dir, installed, consent: true, ask: reply("<<<FILE\n# Rules\n- Run npm test before you commit. Keep components small.\nFILE>>>") });
  assert.match(done.text, /CLAUDE\.slim\.md/);
  assert.match(done.text, /~3,\d{3} → ~17 tokens/);
  assert.equal(fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8"), LONG);

  const applied = await slimAction({ cwd: dir, installed, apply: true });
  assert.match(applied.text, /Replaced CLAUDE\.md; the old one is in CLAUDE\.md\.bak/);
  assert.equal(fs.readFileSync(path.join(dir, "CLAUDE.md.bak"), "utf8"), LONG);
  assert.match(fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8"), /Keep components small/);
  assert.equal(fs.existsSync(path.join(dir, "CLAUDE.slim.md")), false);
});

test("slim says when there is nothing worth slimming", async (t) => {
  const dir = project(t, { "CLAUDE.md": "# Rules\nShort.\n" });
  const result = await slimAction({ cwd: dir, installed, consent: true, ask: reply("unused") });
  assert.match(result.text, /No instructions file over 2,000 tokens/);
});
