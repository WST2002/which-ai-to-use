---
name: which-ai-to-use
description: Use when the user wants a quick check of how their AI coding tools are set up, asks which AI tool or coding agent to use for a task, wants to save tokens or usage, has hit a usage limit, has several AI tools (Claude Code, Codex, Gemini CLI, Copilot, Cursor, Aider, Ollama) and wants to pick one, wants a second opinion from a different AI, needs a free or private/local option, or wants CLAUDE.md, AGENTS.md, GEMINI.md and other AI rules files kept in sync.
---

# Which AI to Use

## Overview

Answer "which of my AI tools should do this?" from what is actually installed on this machine and in this project, with a reason and a runnable command. Never guess which tools the user has.

## Method

0. **Quick check** (the user asks how their setup looks, or you are unsure where to start): run `npx which-ai-to-use` in the project and pass on its plain-language findings. Only run `npx which-ai-to-use fix --yes` after the user agrees.
1. **Recommend for a task.** Run:
   `npx which-ai-to-use "<the task in the user's words>"`
   Add `--prefer free` if the user wants free or local options, `--prefer quality` for the most capable agents, `--private` if the code must not leave the machine.
2. **Show the result** as printed: best tool and why, alternatives, the free option, the command to run, and the second-opinion review command when the task is risky (security, payments, auth, migrations, large refactors).
3. **If the user asks what they have installed**, run `npx which-ai-to-use doctor`.
4. **If the user wants every AI to follow the same project rules**, run `npx which-ai-to-use sync`. It copies `AGENTS.md` (or the first rules file found) into each installed AI's rules file and asks before overwriting hand-written files. Only pass `--yes` when the user has confirmed overwriting.
5. **For a smarter answer**, add `--ai` only after the user agrees: it sends the task and file names (not contents) to an AI they have. For token use over time run `npx which-ai-to-use usage`; to shorten a long CLAUDE.md run `npx which-ai-to-use slim` (it sends the file, so ask first).
6. **If the user wants to save tokens or usage**, run `npx which-ai-to-use tokens` and explain the findings: rules files sent with every message, heavy files with the ignore rules for each tool, and loaded MCP servers. Only add ignore rules or turn off servers when the user agrees.
7. **If a tool's usage limit is reached mid-task**, run `npx which-ai-to-use handoff "<task>" --without <tool-id>`. It writes HANDOFF.md for the next AI and prints the command to continue. For a new task, `--without <tool-id>` alone gives the next best tool.
8. **Do not run the recommended AI yourself.** Give the user the command; they choose.

## Notes

- Sensitive files (`.env`, private keys) make local tools rank first automatically, and cloud tools are marked as sending code to a cloud service.
- Capabilities describe features (terminal agent, inline edits, large context, local, free tier), not opinions about model quality.

---

Made by **Wageesha Tripathi** · [LinkedIn](https://www.linkedin.com/in/wst2002/) · [Email](mailto:tripathiwageesha2002@gmail.com) · [GitHub](https://github.com/WST2002) · [YouTube](https://www.youtube.com/@wst2002rk)
