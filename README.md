# which-ai-to-use

You have Claude Code, Codex, Gemini CLI, Copilot, Cursor or Ollama installed. **Which one should do this task?**

```bash
npx which-ai-to-use "add two-factor login with stripe payments"
```

```
Task: add two-factor login with stripe payments  →  security-sensitive, multi-file-feature

Best:    Claude Code — terminal agent: edits many files and runs your commands
Also:    Codex CLI — agent inside your editor

Run:     claude --model opus "add two-factor login with stripe payments"
Model:   opus — strongest model for risky or large changes
Review:  Open Codex in VS Code and ask: Review my uncommitted changes for bugs  (second opinion from Codex CLI)
```

Works with any AI tool, because it is a plain command-line tool that looks at what is installed on **your** machine and in **your** project.

## Features

| | |
|---|---|
| **Recommend** | Best tool for the task, with the reason and the exact command to run |
| **Better prompt** | Names the files that match the task and asks the agent to run your tests and report the result |
| **Model choice** | For Claude Code: `--model haiku` for small edits (uses far less of your limit), `--model opus` for risky or large work |
| **Token check** | `tokens`: rules files sent with every message, heavy files an agent may read (with ignore rules for each tool), loaded MCP servers |
| **Handoff** | Hit a usage limit mid-task? `handoff` writes `HANDOFF.md` (task, commits, changed files, how to verify) so the next AI continues instead of starting over |
| **Limit reached** | `--without claude-code` recommends the next best tool |
| **Second opinion** | For risky tasks (security, payments, auth, migrations, refactors), a review command for a *different* AI |
| **Privacy mode** | `.env` or private keys in the project → local tools (Ollama) ranked first, cloud tools flagged |
| **Budget** | `--prefer free` ranks free and local tools first; `--prefer quality` ranks the most capable agents first |
| **Doctor** | Which AI tools are installed and which rules files this project has |
| **Sync rules** | One `AGENTS.md` → the same rules in `CLAUDE.md`, `GEMINI.md`, Cursor, Copilot, Windsurf and Cline files |

## Commands

```bash
npx which-ai-to-use "<task>"            # recommend
npx which-ai-to-use tokens              # find what wastes tokens in this project
npx which-ai-to-use handoff "<task>"    # switching AI mid-task: write HANDOFF.md for the next one
npx which-ai-to-use doctor              # what is installed
npx which-ai-to-use sync                # share project rules with every installed AI
```

Options: `--prefer balanced|free|quality`, `--private`, `--without <tool>`, `--json`, and for `sync`: `--from <file>`, `--all`, `--yes`.

## Save tokens

```
npx which-ai-to-use tokens
```

```
Rules files (sent with every message)
  ! CLAUDE.md                         ~6,200 tokens  (over 2,000: trim it)
      Largest sections: Setup ~4,000 tokens · Style ~1,200 tokens · Project ~300 tokens

Heavy files an agent may read (~57,820 tokens in total)
  package-lock.json                   ~57,820 tokens

  Tell your AI tools to skip them:
  Claude Code → .claude/settings.json
      { "permissions": { "deny": ["Read(./package-lock.json)"] } }

MCP servers loaded (each adds its tool descriptions to every request)
  Claude Code: figma, sanity
  Turn off the ones you don't use in this project.
```

Token counts are estimates (about four characters per token). Nothing is changed for you: copy the rules you want.

## Switch AI mid-task

Claude hit its limit halfway through a feature? Hand the work to another tool without starting over:

```
npx which-ai-to-use handoff "add coupon codes to the cart" --without claude-code
```

```
Wrote HANDOFF.md: 3 changed file(s), 1 commit(s) on feat/coupons.

Next:    Gemini CLI — terminal agent: edits many files and runs your commands; free tier
Run:     gemini -i "Read HANDOFF.md and continue the task."
```

`HANDOFF.md` lists the task, the commits on the branch, every uncommitted file with its line counts, and the test command to run first. The next AI reads a short note instead of re-exploring the whole project. Don't commit it.

## Supported tools

Claude Code · Codex CLI · Gemini CLI · Cursor · GitHub Copilot · Windsurf · Cline · Aider · Ollama

Tools are detected from commands on your `PATH`, their settings folders and VS Code/Cursor extensions. Nothing is sent over the network. `tokens` reads MCP config files (such as `~/.claude.json`) only for server names; keys and other values in them are never shown or stored.

Capabilities in [`data/tools.json`](data/tools.json) describe features (terminal agent, inline edits, large context, local, free tier), not opinions about model quality, and carry an "as of" date.

## Use inside your AI

The [`skills/which-ai-to-use`](skills/which-ai-to-use) skill lets you ask any agent that supports skills: *"which AI should I use for this?"*

## Requirements

Node.js 18 or newer.

## License

MIT © Wageesha Tripathi

---

Made by **Wageesha Tripathi** · [LinkedIn](https://www.linkedin.com/in/wst2002/) · [Email](mailto:tripathiwageesha2002@gmail.com) · [GitHub](https://github.com/WST2002)
