# Agent Radar

**English** · [Русский](README.ru.md)

A live pane for [Claude Code](https://code.claude.com) that shows every agent working for you: Claude subagents and the Codex runs they launch, nested under whoever started them, with model, effort, tokens, context fill, elapsed time and launch method.

![Agent Radar pane](docs/screenshots/pane.png)

> [!IMPORTANT]
> **macOS only.** Agent Radar is a Claude Code **mod** — a plugin built on Claude Code's function-hooks technology (`hooks/register.tsx`, drawn through `ui.render` into a Pane). It reads macOS-specific locations (`~/Library/Application Support/Claude`, `/Applications/*.app`) and calls macOS tools (`open`, `osascript`, `sips`). Windows and Linux are not supported.

> Screenshots show fictional projects and numbers.

## Features

- **Two scopes.** *This project* shows the current session, its subagents and the Codex runs they started. *All sessions* scans every Claude Code and Codex session active in the last 15 minutes (2 hours with *Finished* on), grouped by project.
- **One row per agent:** status dot, task title, model, effort (five squares: low · medium · high · xhigh · max), tokens in + out with a bar scaled to the busiest agent, context window fill (green < 50%, blue < 75%, yellow < 90%, red), elapsed time, how it was launched (Claude Desktop, Claude Code CLI, Agent SDK, `codex exec`, Codex Desktop, background or not).
- **Nesting.** A Codex run launched from a subagent's Bash call appears under that subagent; Codex subagents appear under their parent thread.
- **Details** open under the clicked row's tree: token breakdown (new input, cache read/write, output, reasoning), context and Codex rate-limit meters, an activity sparkline, the tools used, the exact launch command.
- **Actions**: open the chat in Claude Desktop, compact, hand off to a new session, stop (with confirmation), ask for status, message a subagent, restart, resume in Terminal (`claude --resume` / `codex resume`), reveal folder or journal, copy command or ID, pin, hide.
- **Compact layout** for narrow panes: two lines per agent, columns still aligned.
- **English and Russian** interface.

| Details | All sessions | Compact |
|---|---|---|
| ![Details](docs/screenshots/details.png) | ![All sessions](docs/screenshots/all-sessions.png) | ![Compact](docs/screenshots/compact.png) |

## Requirements

- macOS
- Claude Code with mods support (function-hooks plugins), in the terminal or in the Claude desktop app
- `python3` (ships with the Xcode command line tools) — used to scan session journals
- Optional: [Codex CLI](https://github.com/openai/codex) or Codex Desktop, Claude Desktop — their sessions show up when present

## Install

At the Claude Code prompt:

```
/plugin install agent-radar --marketplace cioxideru/agent-radar
```

Answer `y` to add the marketplace and pick the *user* scope so the pane opens in every session. From a shell:

```bash
claude plugin marketplace add cioxideru/agent-radar
```

```bash
claude plugin install agent-radar@agent-radar --scope user
```

The pane opens by itself when a session starts; `/agent-radar` reopens it.

## Settings

| Option | Values | Default |
|---|---|---|
| `language` | `en`, `ru` | `en` |

Change it in `/config` (row *agent-radar.language*) or in `settings.json`:

```json
{ "pluginConfigs": { "agent-radar": { "options": { "language": "ru" } } } }
```

## How it works

There is no server and no network access. The mod runs inside Claude Code and reads what is already on disk:

| Source | What it gives |
|---|---|
| Claude Code hooks (`agent.spawn`, `turn.step`, `tool.call`) | this session's subagents, their tokens and the `codex exec` commands they run |
| `~/.claude/projects/**/*.jsonl` | other Claude Code sessions and subagents |
| `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`, `~/.codex/session_index.jsonl` | Codex runs: model, effort, tokens, context, rate limits, titles |
| `~/Library/Application Support/Claude/claude-code-sessions` | which sessions belong to Claude Desktop, for the *open chat* link |

A small Python scanner (`scan.py`, embedded in `hooks/scan.ts`) reads the journals every 3 s for this project and every 10 s for all sessions. App icons are read from the installed apps at runtime and are not shipped with the mod.

## Development

See [AGENTS.md](AGENTS.md) for the layout, checks and conventions.

```bash
claude --plugin-dir ~/path/to/agent-radar
```

## License

[MIT](LICENSE). Not affiliated with Anthropic or OpenAI; Claude and Codex are trademarks of their owners.
