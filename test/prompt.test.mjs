import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { betterPrompt, openEnded, relevantFiles, verifyCommand } from "../src/prompt.mjs";

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

test("a short task for something new asks for the stack, style and content instead of picking them", () => {
  assert.equal(
    betterPrompt("i have to make my portfolio", [], "npm test"),
    "i have to make my portfolio. Before writing any code, ask me which tech stack, style and content I want, and wait for my answers.",
  );
  assert.equal(openEnded("build a landing page for my bakery", []), true);
  assert.equal(openEnded("make the portfolio hero look better", ["src/Hero.tsx"]), false, "work on an existing file is not open-ended");
  assert.equal(openEnded("fix the login bug", []), false);
  const detailed = "build a portfolio site with Next.js and Tailwind, dark theme, sections for about, projects, blog and contact, deployed on Vercel";
  assert.equal(openEnded(detailed, []), false, "a task that already says the stack is not asked again");
});

test("a rare word in the task counts for more than a common one", () => {
  const files = ["src/components/ui/Section.tsx", "src/hooks/useActiveSection.ts", "src/components/sections/Hero.tsx", "src/components/sections/About.tsx", "src/components/sections/Skills.tsx"];
  assert.equal(relevantFiles("make the hero section look better", files)[0], "src/components/sections/Hero.tsx");
});

test("images and other binary files are never files to start with", () => {
  const files = ["media/dashboard.png", "docs/report.pdf", "src/dashboard.mjs", "src/dashboard-page.mjs"];
  assert.deepEqual(relevantFiles("fix the login bug in the dashboard", files), ["src/dashboard.mjs", "src/dashboard-page.mjs"]);
});
