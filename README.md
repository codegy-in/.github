# codegy-in/.github

Org-wide defaults for Codegy repos.

| Path | What |
|---|---|
| `ISSUE_TEMPLATE/`, `pull_request_template.md` | Default issue and PR templates for every repo in the org that doesn't define its own |
| `claude/CLAUDE.shared.md` | Rules every repo's `CLAUDE.md` starts from |
| `claude/hooks/block-secrets.mjs` | Canonical secret-blocking hook (PreToolUse + `--scan` for CI). Copy into each repo's `.claude/hooks/` |
| `claude/hooks/session-start.sh` | Canonical SessionStart hook: deps, git author, load `KNOWLEDGE_GRAPH.md` |
| `workflow-templates/` | "New workflow" templates shown in every org repo's Actions tab |

This repo is **public** because GitHub only applies org default templates from
a public `.github` repo. Never put anything private here.

When a hook changes here, copy it into each repo in the same PR wave
(`hq`, `platform`, `sites`) so they don't drift.
