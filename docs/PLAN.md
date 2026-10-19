# which-ai-to-use — Implementation Plan

**Spec:** `docs/DESIGN.md`

**Constraints:** Node.js 18+, ESM, zero runtime dependencies, `node:test`, no network calls, never reads credentials, never runs another AI.

## Tasks

| # | Task | Files | Tests |
|---|---|---|---|
| 1 | Scaffold: package.json with `bin`, LICENSE, .gitignore, .gitattributes | `package.json` | — |
| 2 | Tool profiles (capabilities, detection hints, commands, "as of" date) | `data/tools.json` | profile shape test |
| 3 | Task classification by keyword rules (English + common Hinglish) | `src/classify.mjs` | `test/classify.test.mjs` |
| 4 | Detection from PATH, home folders and editor extension folders (pure, takes dirs as input) | `src/detect.mjs` | `test/detect.test.mjs` with real temp dirs |
| 5 | Project scan: rules files per AI, sensitive files | `src/project.mjs` | `test/project.test.mjs` |
| 6 | Scoring and recommendation (best, also, free, private, reviewer, commands) | `src/recommend.mjs` | `test/recommend.test.mjs` |
| 7 | Instructions sync plan and apply (Cursor `.mdc` frontmatter) | `src/sync.mjs` | `test/sync.test.mjs` |
| 8 | Text and JSON output | `src/format.mjs` | via CLI tests |
| 9 | CLI: default recommend, `doctor`, `sync`, flags `--prefer`, `--private`, `--yes`, `--json` | `bin/cli.mjs` | `test/cli.test.mjs` spawning the real CLI |
| 10 | Skill, README, CI (Windows, macOS, Linux) | `skills/which-ai-to-use/SKILL.md`, `README.md`, `.github/workflows/ci.yml` | full suite |

Each task: failing test first, then implementation, then commit.
