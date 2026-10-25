# codegy-in/.github

Org-wide defaults for Codegy repos.

| Path | What |
|---|---|
| `ISSUE_TEMPLATE/`, `pull_request_template.md` | Default issue and PR templates for every repo in the org that doesn't define its own |
| `claude/CLAUDE.shared.md` | Rules every repo's `CLAUDE.md` starts from |
| `claude/hooks/block-secrets.mjs` | Canonical secret-blocking hook (PreToolUse + `--scan` for CI; also refuses Bash commands that print secrets). Tests: `node --test claude/hooks/*.test.mjs` (run by `.github/workflows/hooks.yml`). Copy into each repo's `.claude/hooks/`; each repo's `devils-advocate` workflow fails on drift |
| `claude/hooks/session-start.sh` | Canonical SessionStart hook: deps, git author, load `KNOWLEDGE_GRAPH.md` |
| `claude/skills/` | Canonical shared skills: `devils-advocate` (required review for every change, rule 11) and vendored `karpathy-guidelines` (rule 12). Copied into each repo's `.claude/skills/` |
| `workflow-templates/` | "New workflow" templates shown in every org repo's Actions tab |

This repo is **public** because GitHub only applies org default templates from
a public `.github` repo. Never put anything private here.

When a hook, a shared skill or the `devils-advocate` workflow changes here,
copy it into each repo in the same PR wave (`hq`, `platform`, `sites`), and
merge this repo first: each repo's `devils-advocate` workflow diffs its skill
copies against `main` here. Keep skills here generic; Codegy-specific rules
belong in the private repos' `CLAUDE.md` because this repo is public.
