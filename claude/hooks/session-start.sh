#!/usr/bin/env bash
# SessionStart: install deps in cloud sessions, set the git author Vercel will
# accept, and load the repo map into context (stdout becomes context).
set -uo pipefail
cd "$CLAUDE_PROJECT_DIR" || exit 0

if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
  if [ ! -d node_modules ]; then
    npm ci --ignore-scripts --no-audit --no-fund >/dev/null 2>&1 \
      || echo "WARNING: npm ci failed; run it before building."
  fi
  # Vercel refuses deploys whose commit author isn't a team member. Set these
  # (non-secret) env vars in the Claude cloud environment.
  if [ -n "${CODEGY_GIT_EMAIL:-}" ]; then
    git config user.email "$CODEGY_GIT_EMAIL"
    git config user.name "${CODEGY_GIT_NAME:-Codegy}"
  fi
fi

cat KNOWLEDGE_GRAPH.md 2>/dev/null
exit 0
