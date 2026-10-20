import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { everydayAdvice, taskKind } from "../src/everyday.mjs";

const { apps } = JSON.parse(fs.readFileSync(new URL("../data/apps.json", import.meta.url), "utf8"));
const kind = (text) => taskKind(text).id;

test("everyday tasks are understood in English and Hinglish", () => {
  assert.equal(kind("write an essay on climate change"), "writing");
  assert.equal(kind("mera resume ke liye cover letter likh do"), "email");
  assert.equal(kind("make a logo for my bakery"), "images");
  assert.equal(kind("college presentation banana hai on solar energy"), "presentations");
  assert.equal(kind("instagram post design for diwali sale"), "design");
  assert.equal(kind("youtube shorts ka script"), "video");
  assert.equal(kind("birthday song for my sister"), "music");
  assert.equal(kind("latest phones under 20000 compare karo"), "research");
  assert.equal(kind("exam ke liye apne notes se padhai"), "study");
  assert.equal(kind("excel sheet ka data analyse karo"), "data");
  assert.equal(kind("python code me bug hai"), "coding");
  assert.equal(kind("translate this to hindi"), "translation");
  assert.equal(kind("solve this math equation"), "math");
  assert.equal(kind("kuch bhi"), "chat");
});

test("advice names the best apps with reasons, a free option and a ready prompt", () => {
  const advice = everydayAdvice("make a logo for my bakery", apps);
  assert.equal(advice.kind.id, "images");
  assert.ok(advice.best.length >= 2 && advice.best.length <= 3);
  assert.ok(advice.best.every((app) => app.can.includes("images")));
  assert.match(advice.best[0].why, /makes images/);
  assert.equal(advice.free.free, true);
  assert.match(advice.prompt, /Create an image: make a logo for my bakery\./);
});

test("research goes to apps that search the web and show sources", () => {
  const advice = everydayAdvice("latest phones under 20000 compare karo", apps);
  assert.equal(advice.best[0].id, "perplexity");
  assert.match(advice.best[0].why, /shows its sources/);
});

test("coding tasks point developers to the command-line tool", () => {
  const advice = everydayAdvice("python code me bug hai", apps);
  assert.match(advice.hint, /npx which-ai-to-use/);
});

test("an empty task gets no advice", () => {
  assert.equal(everydayAdvice("   ", apps), null);
});
