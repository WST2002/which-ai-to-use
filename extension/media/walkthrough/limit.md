## Never lose your place

Claude, Codex, Gemini, ChatGPT etc. all have limits. When one runs out mid-task, the next AI usually starts from zero.

- The status bar shows **when your limit runs out at this pace**, and when it resets.
- **Claude limit over?** writes `HANDOFF.md`: the task, what was done and the changed files, so another AI carries on.
- When Claude's limit resets, VS Code offers to **hand the task back**.

Using Claude Code? Its plugin writes the handoff for you the moment the limit is hit:

```
/plugin marketplace add WST2002/which-ai-to-use
/plugin install limit-handoff@which-ai-to-use
```
