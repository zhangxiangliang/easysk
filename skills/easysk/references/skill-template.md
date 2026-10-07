# Skill template

The skeleton every new skill starts from (create Step 5) and every fixed
skill is rebuilt on (fix Step 1). Copy, fill every `<placeholder>`, delete
what a placeholder note says to delete — never leave a placeholder behind.

## Folder

```
<skills dir>/<name>/
├── SKILL.md
├── references/       # material the skill READS while running — standards, formats, templates
├── best-practice/    # learning library — REAL artifacts: benchmarks, a real run trace; grows via propose-then-approve
├── data/             # created at runtime, never committed
│   └── runs/         # one json per run, one draft file per output
└── .gitignore
```

`.gitignore` content (two lines, verbatim):

```
# machine-local cache (registries + run traces) — never committed
data/
```

The two committed folders hold different things — do not mix them:

- `references/` = what the skill needs **to run** (for example, the drafting
  standard a comment-writing skill reads in its draft step).
- `best-practice/` = what the team **learned** (worked examples, real traces,
  benchmark cases with "why it worked"). Starts with one seed page; after the
  skill's first real run, propose committing that run's trace (secrets
  stripped) as `best-practice/example-run-trace.json`.

## SKILL.md skeleton

````markdown
---
name: <kebab-case, matches the folder name exactly>
argument-hint: "<the argument shapes, pipe-separated>"
description: <What it does + when to use it + load-bearing detail that prevents a wrong invocation + explicit trigger phrases. This is the ONLY thing the model reads when deciding to fire the skill. Write it pushy — models undertrigger by default, so also name the contexts where it should fire even when the user does not say the skill's name ("also use when the user mentions X, Y, or asks for Z without naming this skill"). End with: Trigger with "/<name>", "<natural phrase>", "<another phrasing>".>
---

# <name>

<Overview: two or three sentences — what this skill does and for whom.>

One hard rule: <the thing that must never happen — e.g. "never post before
the identity is confirmed". Delete this line only if the skill truly has no
irreversible action.>

> Steps: 0 <verb> → 1 <verb> → … Skip fast through steps that add nothing
> this run — but leave a trace line saying what was skipped and why.

## How to call it

| You type | What happens | Done when |
|---|---|---|
| `/<name>` | <default flow> | <finish state — user confirm: yes|no> |
| `/<name> <arg>` | <variant> | <finish state — user confirm: yes|no> |

<Every command states its done condition — the state that counts as
finished, and whether the user must confirm before the skill acts.
"Nothing left silently assumed." Delete this note.>

## Run trace — every run writes `data/runs/<KEY>--<UTC timestamp>--<discriminator>.json`

Machine-local, ignored by git (this folder's own `.gitignore`; add `-2` if the
name exists). `<KEY>` is the work-item key or the literal `NOTICKET`. The file
opens with a `_meta` block (`schema`, `ticket`, `skill`, `run_id`,
`startedAt`, `endedAt`). **Each step writes its record when it finishes —
never at the end.** A run that dies half-way shows where it stopped. Values
stay short — a trace, not a diary. A skipped step gets one line in `skipped`.
Every json is pretty-printed (2-space indent, one key per line).

## Step 0 — <who/what must be confirmed first>

<If the skill posts externally under an identity: use the identity-registry
pattern — discover the real tools (never assume names), resolve who a send
would appear as, confirm once with the user, cache it in
data/identities.json, and on every later run compare registry vs live ("the
registry is the expectation, the live check is the proof"). If the skill is
read-only: Step 0 confirms the data source and credentials instead. Delete
this note.>

<Keep this part: write `data/` files through the REAL path
(`<skills dir>/<name>/data/...`), never through a harness symlink — a
`.claude/` path triggers the always-prompting own-settings protection. If
ordinary writes still prompt on this machine, offer the one-time
`skills/*/data/**` Write/Edit allow rules in the personal
`.claude/settings.local.json`. Ask once; the user may decline.>

```json
"step0": { "<field>": "<value>", "result": "cache-hit | confirmed | stopped",
           "dataWritePermission": "no prompts | offered+added | declined" }
```

## Step 1 — <gather / rebuild context>

<Session memory is not a source — re-read the live state every run. Name
the sources and the order. Delete this note.>

```json
"step1": { "<source>": "<what was read>", "<count>": 0 }
```

## Step N — <act / draft / output>

<For human-facing output: apply the project's own writing rules (language,
readability check) to text the skill writes itself; verbatim data (titles,
error text, quotes) is NEVER rewritten. Record the result in the trace.
Delete this note.>

```json
"stepN": { "draft": "data/runs/<run_id>-draft.md", "projectWritingRules": "applied | none defined" }
```

## Step N+1 — <review / approve / send / record>

<If anything leaves the machine: show first, wait, act only on an explicit
"post it" / "run it" — approval is per action; an OK yesterday is not an OK
today. Close the trace with the outcome. Delete this note.>

```json
"stepN1": { "outcome": "sent | draft-only | abandoned", "id": "<result id>" }
```

## Hard rules

- <thing that must never happen>

## Skill dependencies

<Every skill this one CALLS — runs, or tells the user to run — one bullet
each, with where. A skill that is only mentioned is not a dependency. Write
`- none` if there is nothing. The heading is exact: `easysk check` reads
it. Delete this note.>

- `<skill>` — Step <n>, <why>

## Best-practice library

`best-practice/<seed-page>.md` — <what it holds>. Growth is
propose-then-approve: spot a candidate → analyze why it worked → propose →
write only after the user approves.
````

## A real trace, filled in

[`../best-practice/example-run-trace.json`](../best-practice/example-run-trace.json)
is the real trace of easysk's own creation (back when it was called
create-skill). Copy the shape: short
values, every step present, rejected proposals stay in the record with the
user's own words, `skipped` explains the fast-forwards, and even a wrong turn
stays in. It predates the `_meta` envelope, which every new trace adds on top.

## The `_meta` envelope

Every run file opens with it, then the step records:

```json
{
  "_meta": {
    "schema": 1,
    "ticket": "NOTICKET",
    "skill": "easysk",
    "run_id": "NOTICKET--20260921T011032Z--rebuild--deploy-app",
    "startedAt": "2026-09-21T01:10:32.250Z",
    "endedAt": "2026-09-21T01:24:07.113Z"
  },
  "step0": { "...": "..." }
}
```

`endedAt` is written by the last step, so a killed run leaves it absent —
that absence is the signal the run never finished. Never backfill it.

## Writing rules that go with the skeleton

- **Traps carry dates.** "The chat API mangles code fences (observed
  2026-07-23)" — the date tells a future reader how stale the trap might be.
  Write the trap at the point it would bite, not in a far-away appendix.
- **Runnable commands, not descriptions of commands.**
- **Load-bearing detail goes in the description** if it prevents a wrong
  invocation (for example, a log-search skill names its log streams there).
- **No absolute local paths.** Paths are relative to the project root.
- **`## Skill dependencies` lists calls, not mentions.** Keep it next to the
  hard rules, so a reader sees what else must be installed before the skill
  can run.
