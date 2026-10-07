#!/usr/bin/env bash
# Measure how often a skill's description triggers, with Anthropic's
# skill-creator scripts. It never edits the skill: --optimize only PROPOSES a
# description, and create-skill's own approval gate decides.
#
# Usage (from the project root):
#   skills/create-skill/scripts/trigger-eval.sh <skill-dir> <eval-set.json> \
#       [--runs N] [--model ID] [--description "text to test instead"] \
#       [--optimize ITERATIONS]
#
# eval-set.json is skill-creator's format:
#   [{"query": "...", "should_trigger": true}, ...]
#
# Measure mode writes <skill-dir>/data/evals/<UTC>--trigger.json, prints one
# summary line plus one line per failed query, and exits 0 when every query
# passed, 1 when some failed. --optimize runs skill-creator's run_loop.py,
# writes its results under <skill-dir>/data/evals/<UTC>--optimize/ and prints
# the best description it found (scored on held-out queries). Exit 2 = could
# not run (skill-creator or Python 3.10+ missing, bad arguments).
#
# Two traps this script exists for (both found 2026-10-07):
# - run_eval.py adds a temporary command with the same description and counts
#   a trigger only when THAT command is chosen. If the real skill is installed
#   too, the model may pick it and the run reads as a miss. So the run happens
#   in a temporary project root that links every OTHER skill of this project
#   (they still compete, as in real use) but not this one.
# - Parallel runs share that root's .claude/commands folder, so every run sees
#   every run's temporary copy and often picks another run's copy: 0/3 in
#   parallel, 3/3 one at a time on the same queries. So it runs one at a time.
set -euo pipefail

usage() { sed -n '6,9p' "$0" >&2; exit 2; }
[ $# -ge 2 ] || usage
SKILL=${1%/}; EVALS=$2; shift 2
RUNS=3; MODEL=""; DESC=""; OPTIMIZE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --runs) RUNS=$2; shift 2 ;;
    --model) MODEL=$2; shift 2 ;;
    --description) DESC=$2; shift 2 ;;
    --optimize) OPTIMIZE=$2; shift 2 ;;
    *) usage ;;
  esac
done

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$ROOT"
[ -f "$SKILL/SKILL.md" ] || { echo "trigger-eval: no $SKILL/SKILL.md" >&2; exit 2; }
[ -f "$EVALS" ] || { echo "trigger-eval: no eval set at $EVALS" >&2; exit 2; }
if [ -n "$OPTIMIZE" ] && [ -z "$MODEL" ]; then
  echo "trigger-eval: --optimize needs --model (the model that proposes descriptions)" >&2; exit 2
fi
NAME=$(basename "$SKILL")
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

ENV_OUT=$("$HERE/skill-creator-env.sh") || exit 2
eval "$ENV_OUT"

# Preflight: one tiny `claude -p` with the same model. A logged-out CLI or a
# model id it does not know (another harness passing its own, e.g. "gpt-6")
# makes every query read as a miss, which looks like a real score. Found
# 2026-10-07 from inside a Codex sandbox; this turns it into exit 2.
command -v claude >/dev/null 2>&1 || { echo "trigger-eval: the claude CLI is not on PATH" >&2; exit 2; }
pre=(claude -p "Reply with the single word ok." --output-format json)
[ -n "$MODEL" ] && pre+=(--model "$MODEL")
if ! env -u CLAUDECODE "${pre[@]}" 2>/dev/null | "$SC_PY" -c '
import json, sys
try:
    o = json.load(sys.stdin)
except Exception:
    sys.exit(1)
sys.exit(0 if not o.get("is_error") and str(o.get("result", "")).strip() else 1)'; then
  echo "trigger-eval: claude -p cannot answer here${MODEL:+ with model $MODEL} (logged out, or an unknown model id); no score written" >&2
  exit 2
fi

SKILL_ABS=$(cd "$SKILL" && pwd)
EVALS_ABS=$(cd "$(dirname "$EVALS")" && pwd)/$(basename "$EVALS")
OUT_DIR="$SKILL_ABS/data/evals"; mkdir -p "$OUT_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT
mkdir -p "$SANDBOX/.claude/skills"
for f in CLAUDE.md AGENTS.md; do [ -f "$ROOT/$f" ] && ln -s "$ROOT/$f" "$SANDBOX/$f"; done
for link in "$ROOT"/.claude/skills/*; do
  [ -e "$link" ] || continue
  n=$(basename "$link"); [ "$n" = "$NAME" ] && continue
  ln -s "$(cd "$link" && pwd -P)" "$SANDBOX/.claude/skills/$n"
done

args=(--eval-set "$EVALS_ABS" --skill-path "$SKILL_ABS" --runs-per-query "$RUNS" --num-workers 1)
[ -n "$MODEL" ] && args+=(--model "$MODEL")
[ -n "$DESC" ] && args+=(--description "$DESC")

if [ -n "$OPTIMIZE" ]; then
  RES="$OUT_DIR/$STAMP--optimize"; mkdir -p "$RES"
  (cd "$SANDBOX" && PYTHONPATH="$SC_DIR" "$SC_PY" -m scripts.run_loop "${args[@]}" \
      --max-iterations "$OPTIMIZE" --report none --results-dir "$RES") > "$RES/output.json"
  "$SC_PY" - "$RES/output.json" <<'PY'
import json, sys
o = json.load(open(sys.argv[1]))
def score(k):
    v = o.get(k)
    return v if v is not None else "n/a"
print(f"trigger-eval --optimize: done -> {sys.argv[1]}")
print(f"  original description: {o.get('original_description', '')}")
print(f"  best description:     {o.get('best_description', '')}")
for k in ("best_score", "best_train_score", "best_test_score", "iterations_run"):
    if k in o:
        print(f"  {k}: {score(k)}")
PY
  exit 0
fi

OUT="$OUT_DIR/$STAMP--trigger.json"
(cd "$SANDBOX" && PYTHONPATH="$SC_DIR" "$SC_PY" -m scripts.run_eval "${args[@]}") > "$OUT"

"$SC_PY" - "$OUT" <<'PY'
import json, sys
o = json.load(open(sys.argv[1]))
s = o["summary"]
print(f"trigger-eval: {s['passed']}/{s['total']} passed -> {sys.argv[1]}")
for r in o["results"]:
    if not r["pass"]:
        want = "should trigger" if r["should_trigger"] else "should NOT trigger"
        print(f"  FAIL {r['triggers']}/{r['runs']} ({want}): {r['query'][:90]}")
sys.exit(0 if s["passed"] == s["total"] else 1)
PY
