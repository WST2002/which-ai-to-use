# which-ai-to-use

You have Claude Code, Codex, Gemini CLI, Copilot, Cursor or Ollama installed. **Which one should do this task?**

```bash
npx github:WST2002/which-ai-to-use "add two-factor login with stripe payments"
```

```
Task: add two-factor login with stripe payments  →  security-sensitive, multi-file-feature

Best:    Claude Code — terminal agent: edits many files and runs your commands
Also:    Codex CLI — agent inside your editor

Run:     claude "add two-factor login with stripe payments"
Review:  Open Codex in VS Code and ask: Review my uncommitted changes for bugs  (second opinion from Codex CLI)
```

Works with any AI tool, because it is a plain command-line tool that looks at what is installed on **your** machine and in **your** project.

## Features

| | |
|---|---|
| **Recommend** | Best tool for the task, with the reason and the exact command to run |
| **Second opinion** | For risky tasks (security, payments, auth, migrations, refactors), a review command for a *different* AI |
| **Privacy mode** | `.env` or private keys in the project → local tools (Ollama) ranked first, cloud tools flagged |
| **Budget** | `--prefer free` ranks free and local tools first; `--prefer quality` ranks the most capable agents first |
| **Doctor** | Which AI tools are installed and which rules files this project has |
| **Sync rules** | One `AGENTS.md` → the same rules in `CLAUDE.md`, `GEMINI.md`, Cursor, Copilot, Windsurf and Cline files |

## Commands

```bash
npx github:WST2002/which-ai-to-use "<task>"          # recommend
npx github:WST2002/which-ai-to-use doctor             # what is installed
npx github:WST2002/which-ai-to-use sync               # share project rules with every installed AI
```

Options: `--prefer balanced|free|quality`, `--private`, `--json`, and for `sync`: `--from <file>`, `--all`, `--yes`.

## Supported tools

Claude Code · Codex CLI · Gemini CLI · Cursor · GitHub Copilot · Windsurf · Cline · Aider · Ollama

Tools are detected from commands on your `PATH`, their settings folders and VS Code/Cursor extensions. Nothing is sent over the network and no credentials are read.

Capabilities in [`data/tools.json`](data/tools.json) describe features (terminal agent, inline edits, large context, local, free tier), not opinions about model quality, and carry an "as of" date.

## Use inside your AI

The [`skills/which-ai-to-use`](skills/which-ai-to-use) skill lets you ask any agent that supports skills: *"which AI should I use for this?"*

## Requirements

Node.js 18 or newer.

## License

MIT © Wageesha Tripathi

---

Made by **Wageesha Tripathi** · [LinkedIn](https://www.linkedin.com/in/wst2002/) · [Email](mailto:tripathiwageesha2002@gmail.com) · [GitHub](https://github.com/WST2002)
