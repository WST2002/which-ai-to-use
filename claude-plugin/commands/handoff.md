---
description: Write HANDOFF.md now, with Claude's own notes, so another AI can carry on before the usage limit hits
argument-hint: "[what you are working on]"
allowed-tools: Bash(which-ai-to-use handoff:*), Bash(npx -y which-ai-to-use@latest handoff:*), Read, Edit
---

Claude's usage limit is close. Hand this task over now, while you still know what was done and why.

1. Write the note. Run `which-ai-to-use handoff --to none` if `which-ai-to-use` is installed, otherwise `npx -y which-ai-to-use@latest handoff --to none`. The task the user gave: $ARGUMENTS. If it is not empty, pass it as the first argument, in double quotes. If it is empty, pass no task: the tool reads it from this chat.
2. Read `HANDOFF.md` in the root of the git repository (or in this folder when it has no git). Add a section `## Notes from Claude` just above `## For the next AI`, at most 15 lines:
   - Done: what works now, with the files.
   - Left: the next steps, in order.
   - Decisions: what was chosen and why, so the next AI does not undo it.
   - Watch out: failing tests, files not to touch, anything half-finished.
   Write only what is not already in the note. Never put passwords, keys or tokens in it.
3. Tell the user in one or two lines that `HANDOFF.md` is ready, and that `npx which-ai-to-use handoff` picks who carries on (Antigravity CLI, Codex, a chat on the web).
