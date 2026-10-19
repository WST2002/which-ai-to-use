---
name: which-ai-to-use
description: Use when the user asks which AI tool or coding agent to use for a task, has several AI tools (Claude Code, Codex, Gemini CLI, Copilot, Cursor, Aider, Ollama) and wants to pick one, wants a second opinion from a different AI, needs a free or private/local option, or wants CLAUDE.md, AGENTS.md, GEMINI.md and other AI rules files kept in sync.
---

# Which AI to Use

## Overview

Answer "which of my AI tools should do this?" from what is actually installed on this machine and in this project, with a reason and a runnable command. Never guess which tools the user has.

## Method

1. **Recommend for a task.** Run:
   `npx github:WST2002/which-ai-to-use "<the task in the user's words>"`
   Add `--prefer free` if the user wants free or local options, `--prefer quality` for the most capable agents, `--private` if the code must not leave the machine.
2. **Show the result** as printed: best tool and why, alternatives, the free option, the command to run, and the second-opinion review command when the task is risky (security, payments, auth, migrations, large refactors).
3. **If the user asks what they have installed**, run `npx github:WST2002/which-ai-to-use doctor`.
4. **If the user wants every AI to follow the same project rules**, run `npx github:WST2002/which-ai-to-use sync`. It copies `AGENTS.md` (or the first rules file found) into each installed AI's rules file and asks before overwriting hand-written files. Only pass `--yes` when the user has confirmed overwriting.
5. **Do not run the recommended AI yourself.** Give the user the command; they choose.

## Notes

- Sensitive files (`.env`, private keys) make local tools rank first automatically, and cloud tools are marked as sending code to a cloud service.
- Capabilities describe features (terminal agent, inline edits, large context, local, free tier), not opinions about model quality.

---

Made by **Wageesha Tripathi** · [LinkedIn](https://www.linkedin.com/in/wst2002/) · [Email](mailto:tripathiwageesha2002@gmail.com) · [GitHub](https://github.com/WST2002)
