import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { betterPrompt, relevantFiles, verifyCommand } from "../src/prompt.mjs";

function project(t, files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-prompt-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

const FILES = ["src/auth/login.ts", "src/auth/session.ts", "src/cart/checkout.ts", "src/components/LoginForm.tsx", "README.md", "package-lock.json"];

test("files whose path matches words in the task are suggested, best match first", () => {
  assert.deepEqual(relevantFiles("fix the login form validation", FILES), ["src/components/LoginForm.tsx", "src/auth/login.ts"]);
  assert.deepEqual(relevantFiles("checkout crashes on empty cart", FILES), ["src/cart/checkout.ts"]);
});

test("common words and lockfiles never match", () => {
  assert.deepEqual(relevantFiles("make the thing work please", FILES), []);
  assert.deepEqual(relevantFiles("update package lock", FILES), []);
});

test("the verify command comes from the project", (t) => {
  assert.equal(verifyCommand(project(t, { "package.json": JSON.stringify({ scripts: { test: "vitest run" } }) })), "npm test");
  assert.equal(verifyCommand(project(t, { "package.json": JSON.stringify({ scripts: { test: "x" } }), "pnpm-lock.yaml": "" })), "pnpm test");
  assert.equal(verifyCommand(project(t, { "go.mod": "module x" })), "go test ./...");
  assert.equal(verifyCommand(project(t, { "Cargo.toml": "" })), "cargo test");
  assert.equal(verifyCommand(project(t, { "pyproject.toml": "[tool.pytest.ini_options]" })), "pytest");
  assert.equal(verifyCommand(project(t, { "package.json": JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) })), null);
  assert.equal(verifyCommand(project(t, {})), null);
});

test("the better prompt adds files and how to verify, only when known", () => {
  assert.equal(
    betterPrompt("fix the login bug", ["src/auth/login.ts"], "npm test"),
    "fix the login bug. Start with src/auth/login.ts. When done, run npm test and report the result.",
  );
  assert.equal(betterPrompt("fix the login bug", [], null), "fix the login bug");
});

test("a rare word in the task counts for more than a common one", () => {
  const files = ["src/components/ui/Section.tsx", "src/hooks/useActiveSection.ts", "src/components/sections/Hero.tsx", "src/components/sections/About.tsx", "src/components/sections/Skills.tsx"];
  assert.equal(relevantFiles("make the hero section look better", files)[0], "src/components/sections/Hero.tsx");
});
