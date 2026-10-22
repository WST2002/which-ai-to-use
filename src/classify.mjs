const RULES = [
  ["security-sensitive", /\b(auth|authentication|login token|token|jwt|oauth|password|passwords|hash|hashing|payment|payments|stripe|razorpay|paypal|billing|checkout|migration|migrations|drop (the )?(table|column)|encrypt|encryption|secret|secrets|permission|permissions|security)\b/i],
  ["bug-fix", /\b(fix|bug|bugs|error|errors|crash|crashes|exception|broken|fails?|failing|not working|500|404|theek|galat|issue)\b/i],
  ["tests", /\b(test|tests|testing|unit tests?|e2e|coverage|spec|specs|playwright|jest|vitest|pytest)\b/i],
  ["refactor", /\b(refactor|refactoring|restructure|clean ?up|split|modernize|migrate to|rewrite)\b/i],
  ["code-review", /\b(review|pull request|pr|diff|check my changes|code review)\b/i],
  ["explain-codebase", /\b(explain|understand|how does|how do|walk me through|onboard|overview|summari[sz]e|summary of|samjhao|samjha|samajh)\b/i],
  ["docs", /\b(readme|docs|documentation|document|comments|changelog|jsdoc|docstring)\b/i],
  ["ui", /\b(ui|ux|css|layout|responsive|design|navbar|button|page style|tailwind|figma|component|mobile view|dark mode|look better|looks? (nice|good|modern)|styling|style|theme|colou?rs?|fonts?|spacing|animations?|hero|banner|sundar|beautiful)\b/i],
  ["quick-edit", /\b(rename|typo|one line|single line|small change|tweak|change the text|update the copy)\b/i],
  ["multi-file-feature", /\b(add|build|create|implement|feature|integrate|support|banao|bana do|add karo|dashboard|endpoint|api|page)\b/i],
];

// File paths and source file names ("site/build.mjs") say where the work is, not what kind it is.
const FILE_REFERENCE = /\S*[\\/]\S*|\b[\w-]+\.(?:[cm]?[jt]sx?|py|java|kt|go|rs|rb|php|cs|c|cpp|h|swift|css|scss|html|json|ya?ml|toml|sql)\b/gi;

export const CATEGORIES = RULES.map(([category]) => category);

export function classifyTask(text) {
  const value = String(text ?? "").replace(FILE_REFERENCE, " ");
  const found = RULES.filter(([, pattern]) => pattern.test(value)).map(([category]) => category);
  return found.length ? found : ["multi-file-feature"];
}
