import fs from "node:fs";

const data = JSON.parse(fs.readFileSync(new URL("../data/tools.json", import.meta.url), "utf8"));

export const TOOLS = data.tools;
export const TOOLS_AS_OF = data.asOf;
export const toolById = (id) => TOOLS.find((tool) => tool.id === id);
