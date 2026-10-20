import fs from "node:fs";
import path from "node:path";
import { estimateTokens } from "./tokens.mjs";
import { toolById } from "./tools.mjs";

const fileTokens = (dir, file) => {
  try {
    return Math.ceil(fs.statSync(path.join(dir, file)).size / 4);
  } catch {
    return 0;
  }
};

/**
 * Rough tokens for the first message of a task: the tool's instructions file (sent with every message),
 * the files the prompt points at, and the prompt. Add-ons are counted but not sized: their cost is not on disk.
 */
export function startCost({ dir, toolId, files, prompt, addOns }) {
  const own = toolById(toolId)?.rulesFile;
  const file = [own, "AGENTS.md"].find((name) => name && fs.existsSync(path.join(dir, name)));
  const instructions = file ? { file, tokens: fileTokens(dir, file) } : null;
  const fileTotal = files.reduce((sum, name) => sum + fileTokens(dir, name), 0);
  const promptTokens = estimateTokens(prompt);
  return { total: (instructions?.tokens ?? 0) + fileTotal + promptTokens, instructions, files: fileTotal, prompt: promptTokens, addOns };
}
