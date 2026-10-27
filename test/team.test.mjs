import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readTeam, writeTeam } from "../src/team.mjs";
import { tokenReport } from "../src/tokens.mjs";

const cli = path.resolve(import.meta.dirname, "../bin/cli.mjs");

function project(t, files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-team-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

test("no .which-ai.json means no team settings; a broken one says how to fix it", (t) => {
  assert.equal(readTeam(project(t)), null);
  assert.throws(() => readTeam(project(t, { ".which-ai.json": "{ nope" })), /\.which-ai\.json is not valid JSON: fix it by hand or delete it/);
  assert.throws(() => readTeam(project(t, { ".which-ai.json": '{ "prefer": "cheap" }' })), /"prefer" must be one of: balanced, free, quality/);
  assert.throws(() => readTeam(project(t, { ".which-ai.json": '{ "without": ["chatgpt"] }' })), /unknown tool "chatgpt"/);
});

test("only files inside the project can be on the team list", (t) => {
  const dir = project(t, { ".which-ai.json": JSON.stringify({ skip: ["data/big.csv", "../secrets.txt", "/etc/passwd", "C:\\Windows\\x", "./docs\\api.json"] }) });
  assert.deepEqual(readTeam(dir).skip, ["data/big.csv", "docs/api.json"]);
});

test("files on the team list are skipped whatever their size, and fix covers them", (t) => {
  const dir = project(t, { "data/seed.sql": "insert;\n".repeat(100), "src/app.js": "x" });
  writeTeam(dir, { skip: ["data/seed.sql"] });
  const report = tokenReport({ dir, home: dir, installedIds: ["claude-code"] });
  assert.deepEqual(report.heavy.map((h) => [h.file, h.team]), [["data/seed.sql", true]]);
  assert.match(report.ignore[0].snippet, /Read\(\.\/data\/seed\.sql\)/);
});

test("team shares the heavy files after a yes, and the team's ranking becomes the default", (t) => {
  const dir = project(t, { "package-lock.json": "x".repeat(200000), "package.json": "{}" });
  // An empty PATH, so AI tools installed next to node (npm -g) on this machine stay hidden.
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, encoding: "utf8", input: "", env: { ...process.env, PATH: path.join(dir, "no-tools"), HOME: dir, USERPROFILE: dir } });
  const preview = run("team");
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /Add to the team list in \.which-ai\.json:\n {2}package-lock\.json\nNothing changed\. Run again with --yes to write it\./);
  assert.ok(!fs.existsSync(path.join(dir, ".which-ai.json")));
  assert.match(run("team", "--yes").stdout, /Wrote \.which-ai\.json\. Commit it/);
  assert.deepEqual(readTeam(dir), { prefer: "balanced", without: [], skip: ["package-lock.json"] });
  assert.match(run("team").stdout, /Every heavy file is already on the team list\./);
  const firstPick = () => JSON.parse(run("build a landing page", "--json").stdout).options[0];
  assert.equal(firstPick().free, false);
  writeTeam(dir, { prefer: "free" });
  assert.equal(firstPick().free, true, "the team's ranking is the default");
  assert.match(run("tokens").stdout, /package-lock\.json +~50,000 tokens/);
});
