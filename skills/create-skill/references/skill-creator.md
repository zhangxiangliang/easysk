# Using Anthropic's skill-creator for measurement

`create-skill` owns the process and the gates. Anthropic's `skill-creator`
owns measurement: it runs a skill on test prompts, grades the results, and
tests how often a description triggers. This file says when `create-skill`
calls it, how, and what it may never do.

## The one rule

**skill-creator measures; it never decides.** Its results are evidence or a
proposal, and they go through the same gates as everything else: shown to the
user, approved one by one. Never let it edit a skill, rewrite a description,
or start its own "improve the skill" loop — that loop edits files with no
per-proposal yes, which is exactly what `improve` forbids.

## Is it available?

```bash
eval "$(<this skill>/scripts/skill-creator-env.sh)" && echo "$SC_DIR"
```

The script finds skill-creator's scripts (project skills, user skills,
account-synced skills, then plugins; the newest copy wins) and a Python 3.10 or
newer, which those scripts need. Set `SKILL_CREATOR_DIR` to force one copy,
or `SKILL_CREATOR_DIR=none` to turn every eval step off.

| Result | What to do |
|---|---|
| exit 0 | trigger evals can run |
| exit 0, and `skill-creator` is in the session's available-skills list | output evals can run too |
| exit 1 | skip every step below; write `"skillCreator": "not available — <reason>"` in the trace and carry on with the normal flow |

**Run every eval in the foreground and wait for its result.** Never send one to
the background and end the turn: in a headless run the end of the turn is the
end of the run, so the result never arrives and the gate it feeds never closes
(2026-10-07: a rebuild Step 5 ended with "still running, I'll wait").

Output evals need skill-creator's grader and isolated runs. Claude Code does
them with subagents, and on 2026-10-07 Codex ran them too (8/8 with the skill,
2/8 without). The trigger eval is the fragile one outside Claude Code: it calls
`claude -p`, which a sandbox may not be logged in to — the wrapper then exits 2
instead of writing a score. Pass a Claude model id with `--model`, never the
other harness's own.

## Where things live

| Path | Committed? | What |
|---|---|---|
| `<skill>/evals/evals.json` | yes | output test cases, in skill-creator's format (`prompt`, `expected_output`, `expectations`) |
| `<skill>/evals/trigger-evals.json` | yes | trigger queries: `[{"query": "...", "should_trigger": true}]` |
| `<skill>/data/evals/` | no (`data/` is ignored) | every result: trigger runs, optimize runs, output-eval workspaces |

Never use skill-creator's default `<skill>-workspace/` next to the skill: in
a `skills/` folder it is clutter that git sees.

## Trigger eval — does the description fire when it should?

Cheap and mechanical: one short `claude -p` per query per run.

```bash
<this skill>/scripts/trigger-eval.sh <skill-dir> <skill-dir>/evals/trigger-evals.json \
  --runs 3 --model <the model id of this session>
```

Writing the queries: 8–10 that should trigger and 8–10 that should not.
Make them real — a path, a name, some backstory, casual wording. The useful
negatives are near-misses that share words with the skill but need something
else. Show the set to the user before the first run; bad queries give a bad
score.

**Use the wrapper, never `run_eval.py` directly.** It runs in a sandbox
without the real skill and one query at a time; both traps are explained in
the script header. One query in the sandbox takes about 5 seconds.

## Description proposal — `--optimize`

```bash
<this skill>/scripts/trigger-eval.sh <skill-dir> <eval-set> \
  --runs 3 --model <model id> --optimize 3
```

skill-creator splits the queries into train and held-out test sets, proposes
a new description from the train failures, and picks the best by the test
score. It prints the best description and writes nothing to the skill.

The result is a **proposal**, and a description change is always flagged on
its own. Before showing it, check it against C2: skill-creator's proposals
ignore the word cap (one ran to 130 words against our 80). Trim it, run the
plain trigger eval on the trimmed text with `--description "<text>"`, and show
the user both scores.

## Output eval — does the skill do the job?

Expensive: subagents run every test prompt, with the skill and as a
baseline, then a grader checks every expectation. Use it only when
`evals/evals.json` exists, or the user agreed to write two or three cases.

Call skill-creator with this brief, word for word except the placeholders:

> Measurement only. Skill: `<skill-dir>`. Evals: `<skill-dir>/evals/evals.json`.
> Baseline: `<snapshot folder | none>`. Workspace: `<skill-dir>/data/evals/<UTC>--output/`.
> For each eval, run it with the skill and with the baseline, grade every
> expectation with your grader, aggregate the benchmark, and write the viewer
> with `--static <workspace>/review.html`. Do not edit the skill, its
> description or its evals. Do not start the improvement loop or description
> optimization. Report the pass rate per configuration and every failed
> expectation with its evidence.

**Run it even when the answer looks clear.** Reading the change against
`evals.json` is your own reading, and that is not evidence (2026-10-07: one
rebuild Step 5 named the regression from the diff alone and skipped the eval).

Then check that the skill folder is unchanged (`git status --short <skill-dir>`
shows nothing outside `data/`). If it changed anything, restore it and record
the breach in the trace.

## Where each command uses it

| Command | Step | What runs | What the result becomes |
|---|---|---|---|
| `create` | 5, after the build | trigger eval on the new description | a failing query sends the description back for a proposal; the user approves the change |
| `improve` | 0, gather evidence | trigger eval, and output eval when `evals.json` exists | a failed query or expectation is a 4th kind of evidence; it still needs the user's yes as a proposal |
| `improve` | 1, a description proposal | `--optimize`, then a trimmed re-run | one flagged description proposal with both scores |
| `rebuild` | 5, after the swap | output eval with the Step 0 snapshot as baseline, and trigger eval | an expectation that passed on the old version and fails on the new one is a regression: show it, and offer the rollback line before calling the rebuild done |

`audit` and `fix` never call it: audit measures shape, and fix changes no
behavior, so there is nothing to test.

## Trace fields

```json
"skillCreator": { "available": true, "dir": "<SC_DIR>",
                  "trigger": "18/20 — data/evals/<UTC>--trigger.json",
                  "output": "with skill 5/6, baseline 3/6 — data/evals/<UTC>--output/",
                  "skipped": "output eval: no evals.json, user declined to write one" }
```
