// AI setup score: 100 minus points for each thing that wastes tokens or makes the AI work blind.
const LONG_INSTRUCTIONS = 2000;
const GRADES = [
  [90, "A"],
  [75, "B"],
  [60, "C"],
  [0, "D"],
];

const tokens = (n) => `~${n.toLocaleString("en-US")}`;

/** Score, grade, what cost points (each with a tip), tokens a fix would save, and a line to share. */
export function setupScore({ report, installed, verify }) {
  const items = [];
  const longest = [...report.rules].sort((a, b) => b.tokens - a.tokens)[0];
  if (!report.rules.length) {
    items.push({ id: "no-instructions", points: -10, label: "No instructions file", short: "No instructions file", tip: "Add a short AGENTS.md or CLAUDE.md with how to run and test the project, so the AI does not start blind." });
  } else if (longest.large) {
    items.push({
      id: "instructions-long",
      points: -Math.min(25, Math.round(longest.tokens / 400)),
      label: `${longest.file} is ${tokens(longest.tokens)} tokens`,
      short: `${longest.file}: ${tokens(longest.tokens)} tokens`,
      tip: "It is sent with every message. Shorten it: npx which-ai-to-use slim",
    });
  }
  const heavyTotal = report.heavy.reduce((sum, file) => sum + file.tokens, 0);
  if (heavyTotal) {
    items.push({
      id: "heavy-files",
      points: -Math.min(30, Math.round(heavyTotal / 4000)),
      label: `${report.heavy.length} heavy file${report.heavy.length === 1 ? "" : "s"} (${tokens(heavyTotal)} tokens) your AI can read`,
      short: `Heavy files: ${tokens(heavyTotal)} tokens`,
      tip: `${report.ignore.length ? "Make your AI skip" : "Tell your AI tool to skip"} ${report.heavy.length === 1 ? "it" : "them"}${report.ignore.length ? ": npx which-ai-to-use fix" : "."}`,
    });
  }
  const addOns = new Set(report.mcp.map((server) => server.name)).size;
  if (addOns) {
    items.push({ id: "add-ons", points: -Math.min(15, addOns * 3), label: `${addOns} add-on${addOns === 1 ? "" : "s"} sent with every message`, short: `${addOns} add-on${addOns === 1 ? "" : "s"} on every message`, tip: "Turn off the add-ons (MCP servers) you don't use in this project." });
  }
  if (installed.length === 1) {
    items.push({ id: "one-tool", points: -5, label: `Only one AI tool (${installed[0].name})`, short: "Only one AI tool", tip: "Add a second one (Gemini CLI has a free tier) so a usage limit never stops you: npx which-ai-to-use handoff" });
  }
  if (!verify) {
    items.push({ id: "no-tests", points: -5, label: "No test command found", short: "No test command", tip: "Add a test script so your AI can check its own work." });
  }

  const score = Math.max(0, 100 + items.reduce((sum, item) => sum + item.points, 0));
  const grade = GRADES.find(([min]) => score >= min)[1];
  const saving = heavyTotal + (longest?.large ? longest.tokens - LONG_INSTRUCTIONS : 0);
  const savingText = saving ? ` Fixing it saves ${tokens(saving)} tokens.` : "";
  const share = `My AI coding setup scored ${score}/100 (${grade}) with which-ai-to-use.${savingText} Check yours: npx which-ai-to-use score`;
  return { score, grade, items, saving, share };
}
