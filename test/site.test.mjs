import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSite } from "../site/build.mjs";

test("the website build has the page, the engine and the app list", (t) => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "waitu-site-"));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  buildSite(out);
  const page = fs.readFileSync(path.join(out, "index.html"), "utf8");
  assert.match(page, /<title>Which AI should I use\?/);
  assert.match(page, /import \{ everydayAdvice \} from "\.\/everyday\.mjs"/);
  assert.match(page, /fetch\("\.\/apps\.json"\)/);
  assert.ok(JSON.parse(fs.readFileSync(path.join(out, "apps.json"), "utf8")).apps.length > 10);
  assert.ok(fs.existsSync(path.join(out, "everyday.mjs")));
});
