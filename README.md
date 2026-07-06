# costra

> Run multiple **Claude Code** and **Codex** accounts side by side — each behind its own [pxpipe](https://www.npmjs.com/package/pxpipe-proxy) proxy to save costs, with automatic port allocation and isolated config directories.

[![npm version](https://img.shields.io/npm/v/@martin-christensen/costra)](https://www.npmjs.com/package/@martin-christensen/costra)
[![npm downloads](https://img.shields.io/npm/dm/@martin-christensen/costra)](https://www.npmjs.com/package/@martin-christensen/costra)
[![Release](https://github.com/martin-christensen/costra/actions/workflows/release.yml/badge.svg)](https://github.com/martin-christensen/costra/actions/workflows/release.yml)
[![CI](https://github.com/martin-christensen/costra/actions/workflows/ci.yml/badge.svg)](https://github.com/martin-christensen/costra/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/@martin-christensen/costra)](https://nodejs.org)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 🎬 Demo

![costra demo — registering accounts and launching Claude Code behind a pxpipe proxy](assets/demo.gif)

## ✨ Features

- 🔀 **Multiple accounts, zero collisions** — every account gets its own isolated config directory, so logins never clash
- 🔌 **Stable, automatic port allocation** — ports are assigned once from a configurable range and persisted per account
- 💸 **Cost savings via pxpipe** — each account runs behind its own pxpipe proxy; open its dashboard in the browser any time
- 🤖 **Anthropic & OpenAI support** — works with both Claude Code (`claude`) and Codex (`codex`)
- 🪶 **Lightweight** — plain Node.js, no runtime dependencies, script-friendly

## 📦 Install

```sh
npm install -g @martin-christensen/costra
```

Requires **Node 20+** and the CLI you want to run (`claude` and/or `codex`) on your `PATH`.

## 🚀 Quick start

```sh
# Register accounts (stored in ~/.costra.json)
costra add work --provider anthropic --model claude-fable-5
costra add personal --provider anthropic
costra add oai --provider openai

# Launch — starts a pxpipe proxy in the background if needed (printing its
# URL), then launches the CLI
costra work
costra oai

# Open an account's pxpipe URL in the default browser
costra proxy open work

# Skip the pxpipe proxy entirely
costra work --no-proxy

# Pass extra arguments to the underlying CLI after --
costra work -- --resume
```

## ⚙️ How it works

For each account, costra:

1. Assigns a **stable port** from a configurable range (default `47800–47899`), persisted in the account's config directory, skipping ports assigned to other accounts.
2. Ensures a **pxpipe proxy** is listening on that port (spawned detached, logs to `pxpipe.log` in the account's config dir) and prints its URL — open it in your browser any time with `costra proxy open <account>`.
3. Launches the provider's CLI with the right environment:

| Provider    | CLI      | Base URL env         | Config dir env      | Default config dir        |
| ----------- | -------- | -------------------- | ------------------- | ------------------------- |
| `anthropic` | `claude` | `ANTHROPIC_BASE_URL` | `CLAUDE_CONFIG_DIR` | `~/.config-claude-<name>` |
| `openai`    | `codex`  | `OPENAI_BASE_URL`    | `CODEX_HOME`        | `~/.config-codex-<name>`  |

Because each account gets its own config directory, logins never collide — run as many accounts simultaneously as you like.

## 🧰 Commands

```
costra <account> [--no-proxy] [-- <cli args...>]
                                      Start proxy (if needed) and launch the CLI
costra add <account> [options]        Register an account
costra remove <account>               Unregister an account (config dir is kept)
costra list                           List configured accounts
costra status                         Show ports and proxy state per account
costra stop <account>                 Stop the account's background proxy
costra proxy <account>                Run the proxy in the foreground (debugging)
costra proxy open <account>           Open the account's pxpipe URL in the browser
costra version                        Show version and check npm for a newer one
```

`costra --version` / `-v` prints the bare version with no network access (script-friendly).

### Launch options

| Option       | Description                                     |
| ------------ | ----------------------------------------------- |
| `--no-proxy` | Launch the CLI directly, without a pxpipe proxy |

### `add` options

| Option                | Description                                        |
| --------------------- | -------------------------------------------------- |
| `--provider <p>`      | `anthropic` (default) or `openai`                  |
| `--model <m>`         | Passed to the CLI as `--model <m>`                 |
| `--cli <binary>`      | Override the CLI binary                            |
| `--config-dir <path>` | Override the account's config directory            |

### Update checks

Costra checks npm for a newer version at most once a day. The check runs in a
detached background process, so commands are never delayed — when an update is
found, a one-line notice is printed to stderr on the next run:

```
costra: update available 1.0.0 → 1.1.0 — run: npm install -g @martin-christensen/costra
```

The result is cached in `~/.costra-update.json` (override with the
`COSTRA_UPDATE_CACHE` env var). Set `COSTRA_NO_UPDATE_CHECK=1` to disable
update checks entirely.

## 🔧 Configuration

`~/.costra.json` (override the location with the `COSTRA_CONFIG` env var):

```json
{
  "portRange": [47800, 47899],
  "accounts": {
    "work": { "provider": "anthropic", "model": "claude-fable-5" },
    "oai": { "provider": "openai" }
  }
}
```

## 🤝 Contributing

Contributions are welcome! Feel free to:

- 🐛 [Open an issue](https://github.com/martin-christensen/costra/issues) for bugs or feature requests
- 🔀 Submit a pull request — run `npm test` before pushing
- 💡 Share ideas for new providers or workflows

## 🙏 Acknowledgments

costra stands on the shoulders of some great tools:

- [**Anthropic**](https://www.anthropic.com) — for [Claude Code](https://claude.com/claude-code), the agentic coding CLI this tool was born to multiplex
- [**OpenAI**](https://openai.com) — for [Codex](https://github.com/openai/codex), the second CLI citizen of costra
- [**pxpipe**](https://github.com/teamchong/pxpipe) — for the proxy layer that makes the cost savings and traffic insight possible

## 📄 License

[MIT](LICENSE) © Martin Christensen
