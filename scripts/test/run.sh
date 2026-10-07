#!/usr/bin/env bash
# Test wire-skills.sh and check-skill-deps.sh in throwaway git repos.
# Usage: scripts/test/run.sh    (exit 0 = all passed)
set -euo pipefail

SRC=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
pass=0; fail=0

ok()   { echo "ok   - $1"; pass=$((pass+1)); }
bad()  { echo "FAIL - $1"; fail=$((fail+1)); }
check() { # check <name> <command...>
  local name=$1; shift
  if "$@" >/dev/null 2>&1; then ok "$name"; else bad "$name"; fi
}
refuse() { # refuse <name> <command...>  (expects a non-zero exit)
  local name=$1; shift
  if "$@" >/dev/null 2>&1; then bad "$name"; else ok "$name"; fi
}

new_repo() { # new_repo <dir> -> a git repo with create-skill installed at skills/create-skill
  mkdir -p "$1/skills"
  git -C "$1" init -q
  mkdir "$1/skills/create-skill"
  (cd "$SRC" && tar cf - --exclude .git --exclude data .) | (cd "$1/skills/create-skill" && tar xf -)
}

add_skill() { # add_skill <repo> <name> <deps section body>
  mkdir -p "$1/skills/$2"
  printf -- '---\nname: %s\n---\n\n# %s\n\n## Skill dependencies\n\n%b\n' "$2" "$2" "$3" > "$1/skills/$2/SKILL.md"
}

# 1. standard layout: wire, then check
R="$TMP/standard"; new_repo "$R"
add_skill "$R" alpha '- none'
add_skill "$R" beta '- `alpha` — Step 1'
cd "$R"
check "wire creates links" skills/create-skill/scripts/wire-skills.sh
check "create-skill linked" test -L .claude/skills/create-skill
check "link resolves" test -f .claude/skills/beta/SKILL.md
check "no .agents folder made when absent" test ! -e .agents
check "deps clean after wiring" skills/create-skill/scripts/check-skill-deps.sh
check "second wire is a no-op" bash -c 'skills/create-skill/scripts/wire-skills.sh | grep -q "created=0 replaced=0 removed=0"'

# 2. failures are caught
add_skill "$R" gamma '- `missing-one` — Step 2'
fails_with() { # fails_with <text> <command...>: the command exits non-zero AND prints <text>
  local text=$1 out; shift
  if out=$("$@" 2>&1); then return 1; fi
  grep -q "$text" <<<"$out"
}
check "unknown dependency fails" fails_with "declared 'missing-one' does not exist" skills/create-skill/scripts/check-skill-deps.sh gamma
check "unwired skill fails C6" fails_with "FAIL gamma C6 .claude/skills: no symlink" skills/create-skill/scripts/check-skill-deps.sh gamma
mkdir -p skills/delta
printf -- '---\nname: delta\n---\n\n# delta\n\nUses alpha.\n' > skills/delta/SKILL.md
skills/create-skill/scripts/wire-skills.sh >/dev/null
refuse "missing deps section fails" skills/create-skill/scripts/check-skill-deps.sh delta
check "vendored skill skips C7" env VENDORED_SKILLS=delta skills/create-skill/scripts/check-skill-deps.sh delta

# 3. dead and stale links
rm -rf skills/gamma
check "dead link removed" bash -c 'skills/create-skill/scripts/wire-skills.sh | grep -q "removed=1"'
check "dead link gone" test ! -L .claude/skills/gamma
mkdir .claude/skills/stale && mkdir -p skills/stale && printf -- '---\nname: stale\n---\n' > skills/stale/SKILL.md
refuse "real directory reported as stale" skills/create-skill/scripts/wire-skills.sh
rm -rf .claude/skills/stale skills/stale

# 4. .agents/skills is picked up when it exists
mkdir -p .agents/skills
check "wires .agents too" skills/create-skill/scripts/wire-skills.sh
check ".agents link resolves" test -f .agents/skills/alpha/SKILL.md
check "dry run touches nothing" bash -c 'rm .agents/skills/alpha; skills/create-skill/scripts/wire-skills.sh --dry-run | grep -q "would: create .agents/skills/alpha"; test ! -e .agents/skills/alpha'

# 5. no skills/ folder: skills live straight in .claude/skills
R2="$TMP/flat"; mkdir -p "$R2/.claude/skills"; git -C "$R2" init -q
(cd "$SRC" && tar cf - --exclude .git --exclude data .) | (mkdir "$R2/.claude/skills/create-skill" && cd "$R2/.claude/skills/create-skill" && tar xf -)
cd "$R2"
check "flat layout: wire is a no-op" .claude/skills/create-skill/scripts/wire-skills.sh
check "flat layout: deps check passes, C6 skipped" bash -c '.claude/skills/create-skill/scripts/check-skill-deps.sh | grep -q "C6 skipped"'

# 6. skill-creator detection and the eval wrapper's guards (no model calls)
R3="$TMP/sc"; new_repo "$R3"; add_skill "$R3" alpha '- none'
cd "$R3"; skills/create-skill/scripts/wire-skills.sh >/dev/null
EMPTY="$TMP/empty-home"; mkdir -p "$EMPTY"
check "env: not found exits 1" fails_with "skill-creator not found" env HOME="$EMPTY" skills/create-skill/scripts/skill-creator-env.sh
check "env: SKILL_CREATOR_DIR=none turns it off" fails_with "turned off" env SKILL_CREATOR_DIR=none skills/create-skill/scripts/skill-creator-env.sh
FAKE="$TMP/fake/skill-creator"; mkdir -p "$FAKE/scripts"; : > "$FAKE/scripts/run_eval.py"
check "env: SKILL_CREATOR_DIR wins" bash -c "HOME='$EMPTY' SKILL_CREATOR_DIR='$FAKE' skills/create-skill/scripts/skill-creator-env.sh | grep -q 'SC_DIR=$FAKE'"
mkdir -p .claude/skills/skill-creator/scripts && : > .claude/skills/skill-creator/scripts/run_eval.py
check "env: finds a project install" bash -c "HOME='$EMPTY' skills/create-skill/scripts/skill-creator-env.sh | grep -q 'SC_DIR=.*/.claude/skills/skill-creator'"
check "env: prints a Python 3.10+" bash -c "HOME='$EMPTY' skills/create-skill/scripts/skill-creator-env.sh | grep -q '^SC_PY='"
rm -rf .claude/skills/skill-creator
printf '[{"query": "x", "should_trigger": true}]\n' > evals.json
check "eval: no skill-creator exits 2" bash -c "HOME='$EMPTY' skills/create-skill/scripts/trigger-eval.sh skills/alpha evals.json; [ \$? -eq 2 ]"
check "eval: --optimize needs --model" fails_with "needs --model" skills/create-skill/scripts/trigger-eval.sh skills/alpha evals.json --optimize 1
check "eval: missing skill exits 2" bash -c "skills/create-skill/scripts/trigger-eval.sh skills/nope evals.json; [ \$? -eq 2 ]"
check "eval: wrapper runs one query at a time" grep -q -- '--num-workers 1' skills/create-skill/scripts/trigger-eval.sh
FAKEBIN="$TMP/fakebin"; mkdir -p "$FAKEBIN"
printf '#!/bin/sh\necho %s\n' "'{\"is_error\": true, \"result\": \"\"}'" > "$FAKEBIN/claude"; chmod +x "$FAKEBIN/claude"
check "eval: logged-out claude exits 2, no score" bash -c "PATH='$FAKEBIN':\$PATH HOME='$EMPTY' SKILL_CREATOR_DIR='$FAKE' skills/create-skill/scripts/trigger-eval.sh skills/alpha evals.json 2>&1 | grep -q 'no score written'; [ ! -d skills/alpha/data/evals ] || [ -z \"\$(ls skills/alpha/data/evals)\" ]"
printf '#!/bin/sh\necho %s\n' "'{\"is_error\": false, \"result\": \"ok\"}'" > "$FAKEBIN/claude"
check "eval: a working claude passes the preflight" bash -c "PATH='$FAKEBIN':\$PATH HOME='$EMPTY' SKILL_CREATOR_DIR='$FAKE' skills/create-skill/scripts/trigger-eval.sh skills/alpha evals.json 2>&1 | grep -qv 'no score written'"

echo "passed=$pass failed=$fail"
[ "$fail" -eq 0 ]
