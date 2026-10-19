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

function onPath(bin, pathDirs, platform) {
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
  };
}

export function detectTools({ pathDirs, home, platform } = defaultEnvironment()) {
  const extensions = installedExtensions(home);
  return TOOLS.flatMap((tool) => {
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
