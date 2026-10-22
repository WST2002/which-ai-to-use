import fs from "node:fs";
import path from "node:path";
import { toolById } from "./tools.mjs";

export const TEAM_FILE = ".which-ai.json";
export const PREFERENCES = ["balanced", "free", "quality"];

/**
 * Settings the whole team shares, committed with the project in .which-ai.json: which files every AI should skip,
 * the ranking to use and tools to leave out. Null when the project has none.
 */
export function readTeam(dir) {
  const file = path.join(dir, TEAM_FILE);
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
  let team;
  try {
    team = JSON.parse(raw);
  } catch {
    throw new Error(`${TEAM_FILE} is not valid JSON: fix it by hand or delete it, then run again`);
  }
  const prefer = team.prefer ?? "balanced";
  if (!PREFERENCES.includes(prefer)) throw new Error(`${TEAM_FILE}: "prefer" must be one of: ${PREFERENCES.join(", ")}`);
  const without = Array.isArray(team.without) ? team.without : [];
  const unknown = without.find((id) => !toolById(id));
  if (unknown) throw new Error(`${TEAM_FILE}: unknown tool "${unknown}" in "without"`);
  // Only files inside the project, written as paths from its root.
  const skip = (Array.isArray(team.skip) ? team.skip : [])
    .map((entry) => String(entry).replace(/\\/g, "/").replace(/^\.\//, ""))
    .filter((entry) => entry && !path.posix.isAbsolute(entry) && !/^[a-z]:/i.test(entry) && !entry.split("/").includes(".."));
  return { prefer, without, skip };
}

/** Writes .which-ai.json, keeping what is already there and adding `skip` files. Returns the settings written. */
export function writeTeam(dir, { skip = [], prefer } = {}) {
  const current = readTeam(dir) ?? { prefer: "balanced", without: [], skip: [] };
  const team = { prefer: prefer ?? current.prefer, without: current.without, skip: [...new Set([...current.skip, ...skip])] };
  fs.writeFileSync(path.join(dir, TEAM_FILE), `${JSON.stringify(team, null, 2)}\n`);
  return team;
}
