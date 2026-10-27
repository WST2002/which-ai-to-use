import fs from "node:fs";

const data = JSON.parse(fs.readFileSync(new URL("../data/tools.json", import.meta.url), "utf8"));

/** An install command can differ per platform: { win32: "...", default: "..." }. */
export const installFor = (install, platform = process.platform) =>
  install && typeof install === "object" ? (install[platform] ?? install.default) : install;

export const TOOLS = data.tools.map((tool) => ({ ...tool, install: installFor(tool.install) }));
export const TOOLS_AS_OF = data.asOf;
export const toolById = (id) => TOOLS.find((tool) => tool.id === id);

/**
 * A terminal tool with no editor extension starts only from its command: a settings folder alone is not enough
 * (Antigravity CLI keeps its settings in ~/.gemini, so that folder does not mean Gemini CLI is there).
 */
export function canStart(found) {
  const tool = toolById(found.id);
  const terminalOnly = tool.detect.bins.length > 0 && !tool.run.startsWith("Open ") && tool.detect.extensions.length === 0;
  return !terminalOnly || found.via.some((v) => v.startsWith("command:"));
}
