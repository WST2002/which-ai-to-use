import fs from "node:fs";

const data = JSON.parse(fs.readFileSync(new URL("../data/tools.json", import.meta.url), "utf8"));

/** An install command can differ per platform: { win32: "...", default: "..." }. */
export const installFor = (install, platform = process.platform) =>
  install && typeof install === "object" ? (install[platform] ?? install.default) : install;

export const TOOLS = data.tools.map((tool) => ({ ...tool, install: installFor(tool.install) }));
export const TOOLS_AS_OF = data.asOf;
export const toolById = (id) => TOOLS.find((tool) => tool.id === id);
