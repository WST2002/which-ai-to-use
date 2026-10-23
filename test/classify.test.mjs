import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyTask } from "../src/classify.mjs";

const has = (text, category) => assert.ok(classifyTask(text).includes(category), `${text} → ${classifyTask(text).join(", ")}`);

test("features spanning files", () => {
  has("add two-factor login", "multi-file-feature");
  has("2FA add karo login page pe", "multi-file-feature");
  has("build a dashboard for orders", "multi-file-feature");
});

test("bugs and errors", () => {
  has("fix the crash when cart is empty", "bug-fix");
  has("checkout pe 500 error aa raha hai theek karo", "bug-fix");
});

test("other categories", () => {
  has("write unit tests for the payment service", "tests");
  has("refactor the user module into smaller files", "refactor");
  has("review my pull request", "code-review");
  has("explain how this codebase works", "explain-codebase");
  has("ye project samjhao", "explain-codebase");
  has("update the README with setup steps", "docs");
  has("make the navbar responsive on mobile", "ui");
  has("rename this variable", "quick-edit");
});

test("risky areas are flagged as security-sensitive", () => {
  for (const text of ["add stripe payments", "change password hashing", "write a database migration to drop the column", "fix the auth token bug"]) {
    has(text, "security-sensitive");
  }
});

test("unknown text falls back to a general feature", () => {
  assert.deepEqual(classifyTask("do the thing"), ["multi-file-feature"]);
  assert.deepEqual(classifyTask(""), ["multi-file-feature"]);
});

test("file paths in the task do not change its category", () => {
  assert.deepEqual(classifyTask("fix the failing test in site/build.mjs"), ["bug-fix", "tests"]);
  assert.ok(!classifyTask("fix the crash in src/api/routes.js").includes("multi-file-feature"));
  has("update README.md with setup steps", "docs");
});

test("design work is recognised in everyday words", () => {
  for (const text of ["make the hero section look better", "colors change karo", "page ko sundar banao", "improve the styling of the footer", "add an animation to the banner", "make the page nicer", "redesign the pricing section", "make the cards prettier"]) {
    has(text, "ui");
  }
});

test("summarising a codebase is explaining it", () => {
  assert.ok(classifyTask("summarise this codebase").includes("explain-codebase"));
  assert.ok(classifyTask("give me a summary of the repo").includes("explain-codebase"));
});
