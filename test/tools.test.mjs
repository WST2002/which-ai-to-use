import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, TOOLS_AS_OF, installFor, toolById } from "../src/tools.mjs";

const CAPABILITIES = ["agent", "inline", "largeContext", "local", "freeTier"];

test("every tool profile is complete", () => {
  assert.match(TOOLS_AS_OF, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(TOOLS.length >= 8);
  for (const tool of TOOLS) {
    assert.match(tool.id, /^[a-z-]+$/, tool.id);
    assert.ok(tool.name && tool.homepage.startsWith("https://"), tool.id);
    assert.ok(tool.detect.bins.length + tool.detect.homeDirs.length + tool.detect.extensions.length > 0, tool.id);
    for (const cap of CAPABILITIES) assert.equal(typeof tool.capabilities[cap], "boolean", `${tool.id}.${cap}`);
    assert.ok(tool.run.includes("{task}") || !tool.capabilities.agent, `${tool.id} run must include {task}`);
  }
  assert.equal(new Set(TOOLS.map((t) => t.id)).size, TOOLS.length);
});

test("an install command can differ per platform", () => {
  const install = { win32: "install.cmd", default: "install.sh" };
  assert.equal(installFor(install, "win32"), "install.cmd");
  assert.equal(installFor(install, "darwin"), "install.sh");
  assert.equal(installFor("npm install -g x", "win32"), "npm install -g x");
  assert.equal(typeof toolById("antigravity-cli").install, "string");
});

test("Gemini CLI is no longer free with a personal Google login; Antigravity CLI is the free Google option", () => {
  assert.equal(toolById("gemini-cli").capabilities.freeTier, false);
  const agy = toolById("antigravity-cli");
  assert.equal(agy.capabilities.freeTier, true);
  assert.deepEqual(agy.detect.bins, ["agy"]);
  assert.match(agy.run, /^agy -i "{task}"$/);
});
