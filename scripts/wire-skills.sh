#!/usr/bin/env bash
# Wire every skill in the source folder into every harness folder as a symlink
# (create-skill C6). Run it from the project root.
#
# Usage:
#   wire-skills.sh              # wire, replace wrong links, drop dead links
#   wire-skills.sh --dry-run    # print what would change, touch nothing
#   wire-skills.sh --list-dirs  # print the harness folders (used by check-skill-deps.sh)
#
# Settings (environment, all optional):
#   SKILLS_DIR     source folder, relative to the project root   (default: skills)
#   HARNESS_DIRS   space-separated harness folders, each two levels deep
#                  (default: .claude/skills, plus .agents/skills when it exists)
#
# It only ever creates or removes symlinks. A real directory in a harness
# folder (a stale copy) is reported and left alone; remove it by hand.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$ROOT"

SKILLS_DIR=${SKILLS_DIR:-skills}
SKILLS_DIR=${SKILLS_DIR%/}
if [ -n "${HARNESS_DIRS:-}" ]; then
  read -r -a DIRS <<<"$HARNESS_DIRS"
else
  DIRS=(".claude/skills")
  [ -d ".agents/skills" ] && DIRS+=(".agents/skills")
fi

case "${1:-}" in
  --list-dirs) printf '%s\n' "${DIRS[@]}"; exit 0 ;;
  --dry-run)   DRY=1 ;;
  "")          DRY=0 ;;
  *) echo "usage: $0 [--dry-run|--list-dirs]" >&2; exit 2 ;;
esac

if [ ! -d "$SKILLS_DIR" ]; then
  echo "wire-skills: no $SKILLS_DIR/ folder - skills live directly in the harness folders, nothing to wire"
  exit 0
fi

created=0; replaced=0; removed=0; stale=0; kept=0
act() { # act <description> <command...>
  local msg=$1; shift
  if [ "$DRY" = 1 ]; then echo "would: $msg"; else "$@"; echo "did:   $msg"; fi
}

for dir in "${DIRS[@]}"; do
  dir=${dir%/}
  [ -d "$dir" ] || act "mkdir $dir" mkdir -p "$dir"

  # 1. every skill with a SKILL.md gets a link
  for d in "$SKILLS_DIR"/*/; do
    [ -f "$d/SKILL.md" ] || continue
    n=$(basename "$d")
    link="$dir/$n"; target="../../$SKILLS_DIR/$n"
    if [ -L "$link" ]; then
      if [ "$(readlink "$link")" = "$target" ]; then kept=$((kept+1)); continue; fi
      act "replace $link -> $target (was $(readlink "$link"))" ln -sfn "$target" "$link"
      replaced=$((replaced+1))
    elif [ -e "$link" ]; then
      echo "STALE: $link is a real directory, not a link - remove it by hand, then rerun" >&2
      stale=$((stale+1))
    else
      act "create $link -> $target" ln -s "$target" "$link"
      created=$((created+1))
    fi
  done

  # 2. dead links (renamed or merged skills) go away
  [ -d "$dir" ] || continue
  for link in "$dir"/*; do
    [ -L "$link" ] || continue
    [ -e "$link" ] && continue
    act "remove dead link $link -> $(readlink "$link")" rm "$link"
    removed=$((removed+1))
  done
done

echo "wire-skills: created=$created replaced=$replaced removed=$removed kept=$kept stale=$stale (folders: ${DIRS[*]})"
[ "$stale" -eq 0 ]
