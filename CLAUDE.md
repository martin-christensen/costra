# CLAUDE.md

Guidance for Claude Code (and other AI agents) working in this repository.

## Project

costra runs multiple Claude Code and Codex CLI accounts side by side, each
behind its own [pxpipe](https://github.com/teamchong/pxpipe) proxy, with
automatic port allocation. Node.js >= 20, ESM (`"type": "module"`), no runtime
dependencies. Tests use the built-in Node test runner: `npm test`.

## Commit messages: Conventional Commits (required)

Releases are fully automated with
[release-please](https://github.com/googleapis/release-please). It parses the
commit history on `main` to decide the next version and generate the
changelog, so **every commit — and every PR title (used when squash-merging) —
must follow [Conventional Commits](https://www.conventionalcommits.org/)**:

| Prefix                                     | Effect on release                |
| ------------------------------------------ | -------------------------------- |
| `feat:`                                    | minor bump (1.1.0 → 1.2.0)       |
| `fix:`                                     | patch bump (1.1.0 → 1.1.1)       |
| `feat!:` / `fix!:` / `BREAKING CHANGE:`    | major bump (1.1.0 → 2.0.0)       |
| `docs:` `chore:` `refactor:` `test:` `ci:` | no release, excluded from notes  |

Examples:

- `feat: add --json output to costra list`
- `fix: free stale ports before proxy launch`
- `feat!: drop Node 18 support`

## Release process (automated — do not do manually)

1. Merge conventional commits into `main`.
2. release-please opens/updates a **release PR** that bumps
   `package.json`/`.release-please-manifest.json` and updates `CHANGELOG.md`.
3. Merging that release PR creates a git tag (`vX.Y.Z`) and a GitHub Release
   with generated notes, which triggers the npm publish job.

Therefore:

- **Never manually bump `version` in `package.json`.**
- **Never manually edit `CHANGELOG.md` or `.release-please-manifest.json`.**
- Never create tags or GitHub Releases by hand.

## Pull requests

- `main` is protected; all changes go through PRs with passing CI
  (`test (20)`, `test (22)`).
- PR titles must follow Conventional Commits (they become the commit message
  on squash-merge).
