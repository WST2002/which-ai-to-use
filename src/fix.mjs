import fs from "node:fs";
import path from "node:path";

function addDenyRules(file, rules) {
  let settings = {};
  if (fs.existsSync(file)) {
    try {
      settings = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      throw new Error(".claude/settings.json is not valid JSON: fix it by hand, then run fix again");
    }
  }
  const deny = settings.permissions?.deny ?? [];
  const missing = rules.filter((rule) => !deny.includes(rule));
  if (!missing.length) return 0;
  settings.permissions = { ...settings.permissions, deny: [...deny, ...missing] };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`);
  return missing.length;
}

function addLines(file, lines) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const present = new Set(text.split(/\r?\n/).map((line) => line.trim()));
  const missing = lines.filter((line) => !present.has(line));
  if (!missing.length) return 0;
  const prefix = text && !text.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(file, `${text}${prefix}${missing.join("\n")}\n`);
  return missing.length;
}

/** Applies ignoreAdvice() to the project. Returns the files that changed and how many entries each gained. */
export function applyIgnoreAdvice(dir, advice) {
  return advice
    .map((item) => {
      const file = path.join(dir, item.file);
      const added = item.id === "claude-code" ? addDenyRules(file, JSON.parse(item.snippet).permissions.deny) : addLines(file, item.snippet.split("\n"));
      return { file: item.file, added };
    })
    .filter((change) => change.added > 0);
}
