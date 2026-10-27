import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TOOLS } from "./tools.mjs";

const WINDOWS_EXTENSIONS = [".exe", ".cmd", ".bat", ".ps1", ""];
const EXTENSION_FOLDERS = [".vscode/extensions", ".vscode-insiders/extensions", ".cursor/extensions", ".windsurf/extensions"];
const OLLAMA_LIBRARY = ".ollama/models/manifests/registry.ollama.ai/library";

const isFile = (file) => {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

const isDir = (dir) => {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
};

const listDir = (dir) => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
};

export function onPath(bin, pathDirs, platform) {
  const suffixes = platform === "win32" ? WINDOWS_EXTENSIONS : [""];
  return pathDirs.some((dir) => suffixes.some((suffix) => isFile(path.join(dir, bin + suffix))));
}

function installedExtensions(home) {
  return EXTENSION_FOLDERS.flatMap((folder) => listDir(path.join(home, folder))).map((name) => name.toLowerCase());
}

function ollamaModels(home) {
  const library = path.join(home, OLLAMA_LIBRARY);
  return listDir(library)
    .flatMap((model) => listDir(path.join(library, model)).map((tag) => `${model}:${tag}`))
    .sort();
}

export function defaultEnvironment() {
  return {
    pathDirs: (process.env.PATH ?? "").split(path.delimiter).filter(Boolean),
    home: os.homedir(),
    platform: process.platform,
    env: process.env,
  };
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

// Google stopped serving Gemini CLI to personal Google accounts on 18 June 2026; an API key or Vertex AI still works.
const GEMINI_KEYS = ["GEMINI_API_KEY", "GOOGLE_API_KEY", "GOOGLE_GENAI_USE_VERTEXAI"];
function geminiLoginEnded(home, env = {}) {
  if (GEMINI_KEYS.some((key) => env[key])) return false;
  const settings = readJson(path.join(home, ".gemini", "settings.json"));
  return (settings?.security?.auth?.selectedType ?? settings?.selectedAuthType) === "oauth-personal";
}

/** Installed tools that cannot work as set up, with what to do instead. They are left out of detectTools. */
export function toolProblems({ pathDirs, home, platform, env } = defaultEnvironment()) {
  const gemini = TOOLS.find((tool) => tool.id === "gemini-cli");
  const installed = gemini.detect.bins.some((bin) => onPath(bin, pathDirs, platform));
  if (!installed || !geminiLoginEnded(home, env)) return [];
  return [{ id: gemini.id, name: gemini.name, problem: "Gemini CLI signs in with a personal Google account, which Google stopped serving on 18 June 2026. Use Antigravity CLI (free tier) instead, or give Gemini CLI a paid Gemini API key." }];
}

export function detectTools(environment = defaultEnvironment()) {
  const { pathDirs, home, platform } = environment;
  const broken = new Set(toolProblems(environment).map((p) => p.id));
  const extensions = installedExtensions(home);
  return TOOLS.flatMap((tool) => {
    if (broken.has(tool.id)) return [];
    const via = [
      ...tool.detect.bins.filter((bin) => onPath(bin, pathDirs, platform)).map((bin) => `command: ${bin}`),
      ...tool.detect.extensions
        .filter((id) => extensions.some((name) => name.startsWith(`${id.toLowerCase()}-`)))
        .map((id) => `extension: ${id}`),
    ];
    const settingsFolder = tool.detect.homeDirs.find((dir) => isDir(path.join(home, dir)));
    if (via.length === 0 && !settingsFolder) return [];
    const found = {
      id: tool.id,
      name: tool.name,
      onPath: via.length > 0,
      via: settingsFolder ? [...via, `settings: ~/${settingsFolder}`] : via,
    };
    if (tool.id === "ollama") found.models = ollamaModels(home);
    return [found];
  });
}
