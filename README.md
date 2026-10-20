# which-ai-to-use

Use your AI coding tools better. See what wastes your tokens, pick the right AI (and model) for each task, and hand a task to another AI when Claude's limit runs out.

![which-ai-to-use finds wasted tokens and hands a task to another AI when Claude hits its limit](media/which-ai-to-use-demo.gif)

## Start here

Open a terminal in your project and run:

```bash
npx which-ai-to-use
```

```
✓ Checked: my-app

Your AI tools: Claude Code, Codex CLI

2 things are wasting your tokens:
  1. package-lock.json is ~57,820 tokens. Your AI can read it while searching.
     → Fix it:  npx which-ai-to-use fix
  2. 3 add-ons are switched on (github, notion, slack). Each one is sent with every message.
     → Turn off the ones you don't use, e.g. claude mcp remove github

Starting a task?      npx which-ai-to-use "your task"
Claude limit over?    npx which-ai-to-use handoff
```

That's it. The only other commands you need:

| When | Run |
|---|---|
| Starting a task | `npx which-ai-to-use "fix the login bug"` → which AI and model, with the command to run |
| Claude's limit ran out mid-task | `npx which-ai-to-use handoff "the task" --without claude-code` → another AI carries on |
| Fix what the checkup found | `npx which-ai-to-use fix` → your AI tools skip heavy files (asks first) |

Prefer buttons? Open everything in your browser:

```bash
npx which-ai-to-use dashboard
```

![The which-ai-to-use dashboard: buttons for checkup, task, handoff and fix, with the answer on the right](media/dashboard.png)

The dashboard runs only on your laptop (127.0.0.1) and needs the private link printed in the terminal. Fix shows a preview and changes nothing until you click **Apply fix**.

Nothing is sent anywhere: it only looks at your laptop and your project.

## Everything it does

| | |
|---|---|
| **Recommend** | Best tool for the task with a reason written for that kind of task (design, bug fix, tests, review…), the exact command to run, and tools you don't have yet that would suit it better |
| **Better prompt** | Names the files that match the task and asks the agent to run your tests and report the result |
| **Model choice** | For Claude Code: `--model haiku` for small edits (uses far less of your limit), `--model opus` for risky or large work |
| **Dashboard** | `dashboard`: every command as a button in your browser, on localhost only |
| **Checkup** | `npx which-ai-to-use`: your AI tools and, in plain words, what wastes tokens with one fix each |
| **Fix** | `fix`: makes each installed AI skip heavy files (Claude Code deny rules, `.cursorignore`, `.geminiignore`, `.aiderignore`), after asking |
| **Token details** | `tokens`: instructions files sent with every message (and their biggest sections), heavy files, add-ons (MCP servers) |
| **Handoff** | Hit a usage limit mid-task? `handoff` writes `HANDOFF.md` (task, commits, changed files, how to verify) so the next AI continues instead of starting over |
| **Limit reached** | `--without claude-code` recommends the next best tool |
| **Second opinion** | For risky tasks (security, payments, auth, migrations, refactors), a review command for a *different* AI |
| **Privacy mode** | `.env` or private keys in the project → local tools (Ollama) ranked first, cloud tools flagged |
| **Budget** | `--prefer free` ranks free and local tools first; `--prefer quality` ranks the most capable agents first |
| **Doctor** | Which AI tools are installed and which instructions files this project has |
| **Sync instructions** | One `AGENTS.md` → the same instructions in `CLAUDE.md`, `GEMINI.md`, Cursor, Copilot, Windsurf and Cline files |

## Commands

```bash
npx which-ai-to-use                     # checkup
npx which-ai-to-use "<task>"            # recommend
npx which-ai-to-use fix                 # make your AI tools skip heavy files (asks first)
npx which-ai-to-use dashboard           # the same as buttons in your browser
npx which-ai-to-use tokens              # find what wastes tokens in this project
npx which-ai-to-use handoff "<task>"    # switching AI mid-task: write HANDOFF.md for the next one
npx which-ai-to-use doctor              # what is installed
npx which-ai-to-use sync                # share AGENTS.md with every installed AI
```

Options: `--prefer balanced|free|quality`, `--private`, `--without <tool>`, `--json`, `--yes` (for `fix` and `sync`), and for `sync`: `--from <file>`, `--all`.

## Save tokens

```
npx which-ai-to-use tokens
```

```
Instructions files (sent with every message)
  ! CLAUDE.md                         ~6,200 tokens  (over 2,000: trim it)
      Largest sections: Setup ~4,000 tokens · Style ~1,200 tokens · Project ~300 tokens

Heavy files an agent may read (~57,820 tokens in total)
  package-lock.json                   ~57,820 tokens

  Tell your AI tools to skip them:
  Claude Code → .claude/settings.json
      { "permissions": { "deny": ["Read(./package-lock.json)"] } }

Add-ons (MCP servers) switched on: each one is sent with every message
  Claude Code: github, notion, slack
  Turn off the ones you don't use in this project.
```

Token counts are estimates (about four characters per token). `tokens` changes nothing; `npx which-ai-to-use fix` applies the skip rules after asking.

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
