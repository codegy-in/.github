## What and why

## Devil's advocate

<!-- Output of the devils-advocate skill on this diff. Each BLOCKER / SHOULD FIX with: fixed in <commit> / rebutted because ... -->

## Checks

- [ ] Typecheck, lint, tests and build pass (`/ship` runs them)
- [ ] Schema changes: RLS + policies in the same migration, with access tests
- [ ] No secrets (`node .claude/hooks/block-secrets.mjs --scan`)
- [ ] `CHANGELOG.md` entry appended; `KNOWLEDGE_GRAPH.md` updated if routes, tables or env changed
- [ ] `devils-advocate` skill run on the final diff; every objection answered above
