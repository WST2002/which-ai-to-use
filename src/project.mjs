import fs from "node:fs";
import path from "node:path";
import { TOOLS } from "./tools.mjs";

export const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", ".next", "coverage", "vendor", "venv", ".venv", "target", "__pycache__"]);
const SENSITIVE_NAMES = new Set(["id_rsa", "id_ed25519", "id_ecdsa", "credentials.json", ".npmrc", ".pypirc"]);
const SENSITIVE_EXTENSIONS = new Set([".pem", ".key", ".p12", ".pfx", ".keystore", ".jks"]);
const MAX_DEPTH = 4;

export const RULES_FILES = [...new Set(["AGENTS.md", ...TOOLS.map((tool) => tool.rulesFile).filter(Boolean)])];

function isSensitive(name) {
  if (name === ".env") return true;
  if (/^\.env\./.test(name) && !/\.(example|sample|template)$/.test(name)) return true;
  return SENSITIVE_NAMES.has(name) || SENSITIVE_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function findSensitive(root, dir = root, depth = 0) {
  if (depth > MAX_DEPTH) return [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : findSensitive(root, full, depth + 1);
    return isSensitive(entry.name) ? [path.relative(root, full).split(path.sep).join("/")] : [];
  });
}

export function scanProject(dir) {
  const rulesFiles = Object.fromEntries(RULES_FILES.map((file) => [file, fs.existsSync(path.join(dir, file))]));
  return { rulesFiles, sensitive: findSensitive(dir) };
}
