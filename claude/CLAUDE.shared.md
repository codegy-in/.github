# Codegy: rules for every repo

Each repo's `CLAUDE.md` starts from these and adds its own. The full plan is
`codegy-in/hq` → `README.md`; how a session reaches the live systems and
test accounts is `codegy-in/hq` → `docs/CODING-AGENT-INSTRUCTIONS.md`
(private repo; never copy its contents here).

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
11. **Devil's advocate before every change ships.** Run the `devils-advocate`
    skill (`.claude/skills/devils-advocate`) on the diff of every change before
    opening or merging its PR: code, migrations, config, hooks, and docs or
    skills that agents follow. Fix or rebut every BLOCKER and SHOULD FIX, and
    list each objection with its response in the PR body under "Devil's
    advocate" (in the commit body for a direct push to `main`). No exceptions
    for small or urgent changes; re-run it after large fixes. The `/ship` skill
    runs it. The `devils-advocate` CI check fails a PR whose body lacks the
    section or whose last Verdict line is DO NOT SHIP; on GitHub Free it cannot
    be required, so wait for it to be green before merging.
12. **Write changes by the `karpathy-guidelines` skill.** State assumptions;
    the minimum code that solves the problem; surgical edits where every
    changed line traces to the request; turn each task into a verifiable check
    and loop until it passes (for code, a failing test or probe first; for docs
    and config, name the check that shows it took effect). Where the skill says
    "ask" or "stop", sessions here state the assumption in the report or PR and
    proceed with the most reasonable reading; they stop to ask only for
    irreversible, production-data, money or consent decisions.
