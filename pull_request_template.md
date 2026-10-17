## What and why

## Checks

- [ ] Typecheck, lint, tests and build pass (`/ship` runs them)
- [ ] Schema changes: RLS + policies in the same migration, with access tests
- [ ] No secrets (`node .claude/hooks/block-secrets.mjs --scan`)
- [ ] `CHANGELOG.md` entry appended; `KNOWLEDGE_GRAPH.md` updated if routes, tables or env changed
