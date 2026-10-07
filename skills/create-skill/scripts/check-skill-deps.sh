#!/usr/bin/env bash
# create-skill checks C6 and C7 for every skill (or the named ones).
# Run it from the project root.
#
#   C6 - the skill is a resolving symlink in every harness folder
#        (folders come from wire-skills.sh --list-dirs, the single source).
#   C7 - SKILL.md has a "## Skill dependencies" section; every declared
#        skill exists and passes C6 itself. Skill names the file mentions
#        but does not declare are printed as NOTE lines: things to look at,
#        never failures.
#
# Settings (environment, all optional):
#   SKILLS_DIR       source folder (default: skills). When it does not exist,
#                    skills are read from the first harness folder and C6 is skipped.
#   HARNESS_DIRS     see wire-skills.sh
#   VENDORED_SKILLS  space-separated names of skills copied from elsewhere;
#                    they keep their upstream structure, so they get C6 only.
#
# Usage:
#   check-skill-deps.sh            # every skill
#   check-skill-deps.sh <name>...  # only these
# Exit 1 when any FAIL line was printed.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$ROOT"

HARNESS=()   # bash 3.2 on macOS has no mapfile
while IFS= read -r d; do HARNESS+=("${d%/}"); done < <("$HERE/wire-skills.sh" --list-dirs)

SKILLS_DIR=${SKILLS_DIR:-skills}
SKILLS_DIR=${SKILLS_DIR%/}
SOURCE_DIR=$SKILLS_DIR   # kept for the summary line; SKILLS_DIR may fall back below
CHECK_WIRING=1
if [ ! -d "$SKILLS_DIR" ]; then
  SKILLS_DIR=${HARNESS[0]}
  CHECK_WIRING=0
fi

all_skills=()
for d in "$SKILLS_DIR"/*/; do
  [ -f "$d/SKILL.md" ] || continue
  all_skills+=("$(basename "$d")")
done

vendored=$(tr ' ' '\n' <<<"${VENDORED_SKILLS:-}")
is_vendored() { grep -qx "$1" <<<"$vendored"; }
is_skill()    { [ -f "$SKILLS_DIR/$1/SKILL.md" ]; }

wired() { # wired <skill> -> prints one line per failing folder, returns 1 if any
  local n=$1 ok=0 link
  [ "$CHECK_WIRING" = 1 ] || return 0
  for dir in "${HARNESS[@]}"; do
    link="$dir/$n"
    if [ ! -L "$link" ]; then echo "$dir: no symlink"; ok=1
    elif [ ! -e "$link" ]; then echo "$dir: dead symlink -> $(readlink "$link")"; ok=1
    elif [ "$(readlink "$link")" != "../../$SKILLS_DIR/$n" ]; then echo "$dir: wrong target $(readlink "$link")"; ok=1
    fi
  done
  return $ok
}

if [ $# -gt 0 ]; then targets=("$@"); else targets=(${all_skills[@]+"${all_skills[@]}"}); fi
fails=0; notes=0; checked=0

for n in ${targets[@]+"${targets[@]}"}; do
  if ! is_skill "$n"; then echo "FAIL $n: no $SKILLS_DIR/$n/SKILL.md"; fails=$((fails+1)); continue; fi
  checked=$((checked+1))
  f="$SKILLS_DIR/$n/SKILL.md"

  # C6
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    echo "FAIL $n C6 $line"; fails=$((fails+1))
  done < <(wired "$n" || true)

  # C7
  if is_vendored "$n"; then continue; fi
  section=$(awk '/^## Skill dependencies[[:space:]]*$/{on=1; next} /^## /{on=0} on' "$f")
  declared=""
  if [ -z "$section" ]; then
    echo "FAIL $n C7: no '## Skill dependencies' section"; fails=$((fails+1))
  else
    declared=$(grep -oE '^- `[a-z0-9-]+`' <<<"$section" | sed -E 's/^- `([a-z0-9-]+)`$/\1/' || true)
    if [ -z "$declared" ] && ! grep -qE '^- none[[:space:]]*$' <<<"$section"; then
      echo "FAIL $n C7: section has no '- \`skill\`' bullet and no '- none'"; fails=$((fails+1))
    fi
    for dep in $declared; do
      if [ "$dep" = "$n" ]; then echo "FAIL $n C7: declares itself"; fails=$((fails+1)); continue; fi
      if ! is_skill "$dep"; then echo "FAIL $n C7: declared '$dep' does not exist in $SKILLS_DIR/"; fails=$((fails+1)); continue; fi
      while IFS= read -r line; do
        [ -n "$line" ] || continue
        echo "FAIL $n C7: dependency '$dep' not wired ($line)"; fails=$((fails+1))
      done < <(wired "$dep" || true)
    done
  fi

  # candidates: other skills the file names outside the section, not declared
  rest=$(awk '/^## Skill dependencies[[:space:]]*$/{on=1; next} /^## /{on=0} !on' "$f")
  for other in ${all_skills[@]+"${all_skills[@]}"}; do
    [ "$other" = "$n" ] && continue
    grep -qx "$other" <<<"$declared" && continue
    if grep -qE "(^|[^a-z0-9-])$other([^a-z0-9-]|$)" <<<"$rest"; then
      echo "NOTE $n C7 candidate: mentions '$other' but does not declare it"; notes=$((notes+1))
    fi
  done
done

if [ "$CHECK_WIRING" = 1 ]; then where="folders: ${HARNESS[*]}"; else where="no $SOURCE_DIR/ source folder, read $SKILLS_DIR, C6 skipped"; fi
echo "check-skill-deps: checked=$checked fail=$fails note=$notes ($where)"
[ "$fails" -eq 0 ]
