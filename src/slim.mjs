// Slim: ask an installed AI to rewrite a long instructions file shorter, as a separate file to review.
const MAX_RATIO = 0.9;

export const slimFileName = (file) => file.replace(/\.md$/i, ".slim.md");

export function buildSlimPrompt(file, text) {
  return [
    `Rewrite this AI instructions file (${file}) so it is much shorter. It is sent with every message, so every word costs tokens.`,
    "Keep every rule, command, path, version and must/never instruction. Remove repetition, long examples, filler and explanations the AI does not need.",
    "Use short headings and bullet points. Do not add anything new. Do not use any tools.",
    "Reply with the new file only, between the markers <<<FILE and FILE>>>.",
    "",
    "<<<ORIGINAL",
    text,
    "ORIGINAL>>>",
  ].join("\n");
}

/** The new file from between the markers, or null unless it is non-empty and clearly shorter. */
export function parseSlim(reply, original) {
  const match = /<<<FILE\r?\n([\s\S]*?)\r?\nFILE>>>/.exec(reply);
  if (!match) return null;
  const text = `${match[1].trim()}\n`;
  if (text.trim().length === 0 || text.length > original.length * MAX_RATIO) return null;
  return text;
}
