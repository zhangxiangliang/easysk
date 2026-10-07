#!/usr/bin/env bash
# Find Anthropic's skill-creator scripts and a Python that can run them.
# create-skill uses skill-creator only when this succeeds; otherwise it skips
# the eval steps and says so in the trace (references/skill-creator.md).
#
# Usage:   eval "$(<this skill>/scripts/skill-creator-env.sh)"
# Prints:  SC_DIR=<folder holding scripts/run_eval.py>
#          SC_PY=<python 3.10 or newer>
# Exit 1 with one reason line on stderr when either is missing.
# SKILL_CREATOR_DIR=none turns it off, so every eval step is skipped.
#
# Search order for SC_DIR (first folder with scripts/run_eval.py wins; the
# newest copy wins inside one root, because synced copies pile up):
#   $SKILL_CREATOR_DIR, <project>/.claude/skills, <project>/.agents/skills,
#   ~/.claude/skills (user and account-synced skills), ~/.claude/plugins
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

find_in() { # find_in <root> -> newest skill-creator folder with the scripts, or nothing
  [ -d "$1" ] || return 0
  find -L "$1" -path '*skill-creator/scripts/run_eval.py' -type f 2>/dev/null \
    | while IFS= read -r f; do d=$(dirname "$(dirname "$f")"); printf '%s\t%s\n' "$(stat -c %Y "$d" 2>/dev/null || stat -f %m "$d")" "$d"; done \
    | sort -rn | head -1 | cut -f2
}

if [ "${SKILL_CREATOR_DIR:-}" = none ]; then
  echo "skill-creator-env: turned off (SKILL_CREATOR_DIR=none)" >&2
  exit 1
fi

SC_DIR=""
if [ -n "${SKILL_CREATOR_DIR:-}" ] && [ -f "$SKILL_CREATOR_DIR/scripts/run_eval.py" ]; then
  SC_DIR=$SKILL_CREATOR_DIR
else
  for r in "$ROOT/.claude/skills" "$ROOT/.agents/skills" "$HOME/.claude/skills" "$HOME/.claude/plugins"; do
    SC_DIR=$(find_in "$r")
    [ -n "$SC_DIR" ] && break
  done
fi
if [ -z "$SC_DIR" ]; then
  echo "skill-creator-env: skill-creator not found (no scripts/run_eval.py under the searched folders)" >&2
  exit 1
fi

SC_PY=""
for p in python3.13 python3.12 python3.11 python3.10 python3 python; do
  command -v "$p" >/dev/null 2>&1 || continue
  if "$p" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
    SC_PY=$(command -v "$p"); break
  fi
done
if [ -z "$SC_PY" ]; then
  echo "skill-creator-env: no Python 3.10+ found (skill-creator's scripts need it)" >&2
  exit 1
fi

printf 'SC_DIR=%q\nSC_PY=%q\n' "$SC_DIR" "$SC_PY"
