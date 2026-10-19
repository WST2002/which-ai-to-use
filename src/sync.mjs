import fs from "node:fs";
import path from "node:path";
import { RULES_FILES } from "./project.mjs";

const SOURCE_ORDER = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".github/copilot-instructions.md", ".cursor/rules/project.mdc", ".windsurfrules", ".clinerules", "CONVENTIONS.md"];
const MARKER = "by which-ai-to-use";
const CURSOR_FRONTMATTER = "---\ndescription: Project rules shared by every AI tool\nalwaysApply: true\n---\n";

const readIfExists = (file) => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

function stripGenerated(text) {
  return text
    .replace(/^---\n[\s\S]*?\n---\n/, "")
    .replace(/^<!-- Synced from .+ by which-ai-to-use\. Edit .+ instead\. -->\n\n/, "");
}

function render(target, source, rules) {
  const note = `<!-- Synced from ${source} ${MARKER}. Edit ${source} instead. -->\n\n`;
  return target.endsWith(".mdc") ? `${CURSOR_FRONTMATTER}${note}${rules}` : `${note}${rules}`;
}

export function planSync(dir, { from, targets = RULES_FILES } = {}) {
  const source = from ?? SOURCE_ORDER.find((file) => fs.existsSync(path.join(dir, file)));
  if (!source || !fs.existsSync(path.join(dir, source))) {
    throw new Error("No rules file found. Create AGENTS.md with your project rules, then run sync again.");
  }
  const rules = stripGenerated(fs.readFileSync(path.join(dir, source), "utf8"));
  const items = targets
    .filter((file) => file !== source)
    .map((file) => {
      const content = render(file, source, rules);
      const existing = readIfExists(path.join(dir, file));
      let status = "create";
      if (existing === content) status = "same";
      else if (existing !== null) status = existing.includes(MARKER) ? "update" : "differs";
      return { file, status, content };
    });
  return { source, items };
}

export function applySync(dir, plan, { overwrite = false } = {}) {
  const written = [];
  for (const item of plan.items) {
    if (item.status === "same" || (item.status === "differs" && !overwrite)) continue;
    const file = path.join(dir, item.file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, item.content);
    written.push(item.file);
  }
  return written;
}
