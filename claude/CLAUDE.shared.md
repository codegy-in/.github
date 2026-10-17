# Codegy: rules for every repo

Each repo's `CLAUDE.md` starts from these and adds its own. The full plan is
`codegy-in/hq` → `README.md`.

1. **No secrets in git, ever:** not in code, docs, skills, commit messages or
   commands. Secrets live in Vercel env, Supabase Vault, Bitwarden or Claude
   environment secrets. The PreToolUse hook (`claude/hooks/block-secrets.mjs`)
   blocks them; don't work around it.
2. **Only HQ holds powerful keys.** Sessions hold at most `HQ_API_KEY`. Never
   call GitHub/Vercel/Supabase admin APIs with a personal token from a session.
3. **No Supabase MCP on `platform-prod`.**
4. **RLS on every table, policies in the same migration.** Revoke the default
   `anon`/`authenticated` grants, then grant minimally. Prove access as a real
   role (`set role` / real API), never as the superuser.
5. **Production DB changes only via migrations merged to `main`.**
6. Enums lowercase snake_case; money `bigint` paise; soft delete
   (`deleted_at`); derived values are views.
7. **Append to `CHANGELOG.md` at the end of every task.** New entry at the
   bottom, never edit old ones, same commit.
8. Keep `KNOWLEDGE_GRAPH.md` current when routes, tables, env vars or
   integrations change.
9. Commits: what and why, wrapped at 72 chars, `Co-Authored-By` trailer,
   author email = a Vercel team member (`CODEGY_GIT_EMAIL`).
10. Student data (DPDP): never in issues, logs, screenshots or third-party
    tools; data stays in Mumbai.
