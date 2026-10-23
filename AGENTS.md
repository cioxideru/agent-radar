# AGENTS.md

Guide for AI coding agents and contributors working on Agent Radar, a Claude Code mod (function-hooks plugin) for macOS, with Linux and Windows support.

## Layout

| Path | What it is |
|---|---|
| `.claude-plugin/plugin.json` | manifest: name, version, `userConfig.language`, types contract |
| `.claude-plugin/marketplace.json` | makes this repository a one-plugin marketplace |
| `hooks/hooks.json` | points the engine at `register.tsx` |
| `hooks/register.tsx` | the whole mod: hooks, polling, the Pane drawing, actions |
| `hooks/i18n.ts` | every user-visible string, `en` and `ru`; `Strings` is the English shape |
| `hooks/charts.ts` | SVG builders for the token stack bar, meters, the sparkline and the project pills; our own Claude and Codex marks |
| `hooks/scan.ts` | `scan.py` embedded as a string — generated, do not edit by hand |
| `scan.py` | journal scanner run with `python3 -I -c` (`python` on Windows); paths come out with `/` on every system; prints `{codex: [...], claude: [...]}` as JSON. The previous scan comes in on stdin: a journal unchanged since (same mtime and size) is taken from it unread. Quiet parents of active rows are read too (a session for its subagent, an agent for a nested one, a Codex thread for its child), so no child is drawn as a root |
| `types/index.d.ts` | `Agent`, `Stats`, `View` and the `PluginState['agent-radar']` contract |
| `tests/` | `radar.test.ts` (pure helpers), `pane.test.tsx` (mounted pane on terminal and desktop), `scan_test.py` (the scanner on fictional journals in a temporary home) |
| `docs/screenshots/` | README images, made from fictional data |

`.claude-plugin/types/` is written by the engine when the mod loads and is git-ignored.

## Installing in Claude Code

Users install from this repository as a marketplace (full steps in `README.md`, *Install*):

```bash
claude plugin marketplace add cioxideru/agent-radar
```

```bash
claude plugin install agent-radar@agent-radar --scope user
```

While developing, load the working copy instead: `claude --plugin-dir .`, then `/reload-plugins` after each edit.

## Checks

Run all four before a commit:

```bash
claude plugin validate .
```

```bash
claude plugin test .
```

```bash
npx -y -p typescript@5.6.3 tsc -p tsconfig.json
```

```bash
python3 -I tests/scan_test.py
```

`tsc` needs `.claude-plugin/types/`, which appears after the mod has been loaded once (`claude --plugin-dir .`).

## Rules

- **Edit `scan.py`, then regenerate `hooks/scan.ts`** (keep the comment line on top; the script must not contain a backtick):

  ```bash
  { head -1 hooks/scan.ts; echo 'export const SCAN_PY = String.raw`'; cat scan.py; echo '`'; } > /tmp/scan.ts && mv /tmp/scan.ts hooks/scan.ts
  ```

- **Strings go through `i18n.ts`.** Add the key to `en` first, then to `ru` (the type forces it). Logic must never compare against translated text; `t.bg` is the only translated marker read back, and only within one load.
- **Element rules of the Pane:** a `Button` holds strings and `Text` only; `Box` width is a number of cells or a percentage; `Svg` sizes are CSS pixels and only exist on graphical surfaces — always keep a text fallback for the terminal.
- **State** lives in `atom`s declared in `types/index.d.ts` (`agents`, `others`, `view`, `tick`, `shells` for this session's background commands); module variables reset on every reload. What chats share goes through `$.store`: `open` (whether the pane is wanted) and `allScan` (the last *All* scan, reused for 9 s). Journals are read only while the pane is open.
- **macOS first, Linux and Windows kept working.** `os` is read at session start; go through `opener` / `reveal` instead of calling `open`, and keep macOS-only extras (Terminal via `osascript`) behind `os === 'mac'` with a fallback. Do not ship app icons or other third-party assets: the Claude and Codex marks in `charts.ts` are our own small drawings.
- **No network, no secrets.** The mod reads local journals only. Never put real project names, paths or transcripts in tests, docs or screenshots.
- Keep diffs small and in the style of the surrounding code: short helpers, comments that say why.

## Releasing

Bump `version` in `.claude-plugin/plugin.json`, run the checks, commit, tag `vX.Y.Z`, push. Users update with `/plugin marketplace update agent-radar`.
