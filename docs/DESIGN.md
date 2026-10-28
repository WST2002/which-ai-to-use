# which-ai-to-use — Design

- **Status:** Draft for review
- **Date:** 2026-10-19
- **Author:** Wageesha Tripathi

## 1. Purpose

Developers now have several AI coding tools installed at once — Claude Code, Codex CLI, Gemini CLI, GitHub Copilot, Cursor, Aider, Cline, local models through Ollama — and no simple way to answer:

- *Which of my AI tools should do this task?*
- *Which one is free, which one keeps my code private, which one can read my whole codebase?*
- *How do I get a second opinion from a different AI?*
- *Why does each AI follow different project rules?*

`which-ai-to-use` answers these from the developer's own machine and project. It works the same no matter which AI the developer uses, because it is a plain command-line tool, not a feature of one AI.

## 2. Who it is for

- Developers who have two or more AI coding tools and switch between them.
- Teams where members use different AIs on the same repository.
- Anyone who wants the free or private option when it is good enough.

## 3. What it does

### 3.1 Recommend (main command)

```
npx which-ai-to-use "add two-factor login"
```

Output:

```
Task: add two-factor login  →  multi-file feature

Best:   Claude Code   — terminal agent: edits many files and runs your tests
Also:   Codex CLI     — terminal agent: good second option or second opinion
Free:   Antigravity CLI — free tier, terminal agent
Private: not needed (no sensitive files detected)

Run:    claude "add two-factor login"
Review: codex "review the changes on this branch"
```

Every suggestion states **why**, based on the tool's capabilities, and gives the exact command to run.

### 3.2 Doctor — what is installed

```
npx which-ai-to-use doctor
```

A table of every supported AI tool: installed or not, version, and which instruction files this project has for each AI.

### 3.3 Second opinion

For risky tasks (security, payments, database migrations, large refactors) the recommendation adds a **review step by a different AI** than the one doing the work, with both commands. One model's blind spots are often caught by another.

### 3.4 Privacy mode

If the project contains sensitive files (`.env`, private keys, credential files) or the user passes `--private`, local tools (Ollama, Aider with a local model) are ranked first and cloud tools are marked "sends code to a cloud service".

### 3.5 Budget preference

`--prefer free` ranks free and local tools first; `--prefer quality` ranks the most capable agents first. The preference can be saved in a config file.

### 3.6 Instructions sync

Each AI reads its own rules file:

| AI | File |
|---|---|
| Claude Code | `CLAUDE.md` |
| Codex CLI and other AGENTS.md tools | `AGENTS.md` |
| Gemini CLI | `GEMINI.md` |
| Cursor | `.cursor/rules/*.mdc` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Windsurf | `.windsurfrules` |
| Cline | `.clinerules` |

```
npx which-ai-to-use sync
```

Takes one source file (default `AGENTS.md`, or whichever exists) and writes the same rules to every other AI's file, so every AI follows the same project rules. It shows what it will change and asks before overwriting a file that differs.

### 3.7 Skill

A `SKILL.md` that any agent supporting skills can load, so the developer can ask inside their AI: *"which AI should I use for this?"* The skill runs the command and explains the result.

## 4. How it works

```
detect tools ──► classify task ──► score tools ──► print recommendation + commands
      │                                 ▲
      └── detect project files ─────────┘ (privacy, existing rules)
```

### 4.1 Detecting installed tools

| Tool | How it is detected |
|---|---|
| Claude Code | `claude` on PATH, or the VS Code extension `anthropic.claude-code` |
| Codex CLI | `codex` on PATH, or the VS Code extension `openai.chatgpt` |
| Antigravity CLI | `agy` on PATH |
| Gemini CLI | `gemini` on PATH; left out with a warning when it signs in with a personal Google account (no longer served since 18 June 2026) |
| Aider | `aider` on PATH |
| Cursor | `cursor` or `cursor-agent` on PATH |
| GitHub Copilot | VS Code extension `github.copilot` (`code --list-extensions`) or `gh copilot` |
| Cline | VS Code extension `saoudrizwan.claude-dev` |
| Ollama | `ollama` on PATH; installed models from `ollama list` |

A settings folder alone (`~/.claude`, `~/.codex`, `~/.gemini`) does not count as installed: it may be left over after an uninstall, and `~/.gemini` is also where Antigravity CLI keeps its settings. `doctor` still lists it as found without a command. Detection only reads names and versions. It never reads credentials and never sends anything over the network.

### 4.2 Classifying the task

Keyword and pattern rules map the task text to one or more categories:

`quick-edit`, `multi-file-feature`, `bug-fix`, `tests`, `refactor`, `code-review`, `explain-codebase`, `docs`, `ui`, `security-sensitive`.

Rules are transparent and listed in one file, so the result can always be explained.

### 4.3 Scoring

Each tool has a **capability profile** in `data/tools.json`:

- runs as a terminal agent (can edit many files and run commands)
- inline editor completion
- very large context window
- works offline / local
- free tier available
- reads project rules files

Each task category declares the capabilities it needs. A tool's score is the match between the two, adjusted by the user's preference (`free`, `quality`, `private`). The profiles describe features, not opinions about which model is "smarter", and carry an "as of" date so they can be kept current.

### 4.4 Never

- Never runs another AI on its own in version 1. It only prints the command.
- Never sends code or task text anywhere.
- Never overwrites a rules file without showing the difference and asking.

## 5. Delivery

- Repository: `github.com/WST2002/which-ai-to-use`, MIT license.
- Node.js 18+, no runtime dependencies.
- Runs with `npx github:WST2002/which-ai-to-use` immediately; publishing to npm as `which-ai-to-use` later requires the author's own `npm login`.
- Tests with `node:test`, CI on Windows, macOS and Linux.

## 6. Versions

| Version | Scope |
|---|---|
| 1.0 | Detect, recommend, doctor, second opinion, privacy mode, budget preference, instructions sync, skill |
| 2.0 | Hand the task to the chosen AI after the user confirms |
| Later | Usage stats per tool, team-shared preferences |

## 7. Success criteria

1. `doctor` correctly lists installed tools on Windows, macOS and Linux.
2. Every recommendation names a tool the user actually has, with a reason and a runnable command.
3. If only one tool is installed, it says so and still gives useful advice (including what installing a second tool would add).
4. Privacy mode never ranks a cloud tool first when sensitive files are present.
5. `sync` produces identical rules in every AI's file and never overwrites without confirmation.
