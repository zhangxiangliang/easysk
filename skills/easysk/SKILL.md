---
name: easysk
argument-hint: "[idea] | audit | fix <name> | improve <name> | rebuild <name>"
description: "Create, audit, fix, improve or rebuild a skill in this project under one standard structure (create is co-design; improve only from evidence; rebuild is the only command that may delete a rule). Use when any repeated workflow should become a reusable command, when skills do not load or show up, or when a patched skill needs a clean rewrite, even without the word skill. Trigger with \"/easysk\", \"create a skill\", \"audit skills\", \"fix skill <name>\", \"rebuild skill <name>\"."
---

# easysk

One tool for a skill's whole life: **create, audit, fix, improve, rebuild**.
It holds every skill in the project to one standard structure, small
read-only skills included. Vendored skills (copied in from somewhere else)
keep their upstream's structure on purpose: audit and fix skip them.

Two hard rules:

- **Never lose content silently.** Any rewrite of an existing skill shows a
  content inventory (every rule, trap and command, ticked off) before the
  file changes. An unmatched item is shown in red, never dropped quietly.
- **Never grow a library or change a skill without approval.** fix, improve
  and best-practice additions are proposals until the user says yes to the
  ones they have seen. "Do whatever you think is best" is not a yes.

Project rules win. If the project's own instructions (`CLAUDE.md`,
`AGENTS.md`, a skills index) say how skills are registered, which language
they use or how prose is checked, follow them on top of this file.

`easysk` in a command below means `npx -y easysk@1` — the CLI release that
matches this file. Run it from the project root; it prints JSON. Over MCP the
same commands are the `easysk_check` and `easysk_wire` tools.

## How to call it

| You type | What happens | Done when |
|---|---|---|
| `/easysk <idea>` | Create a new skill: dedup → understand (question loop) → confirm step list → confirm details + commands → final yes → build | the new skill is written, wired, checked, and shows up after a restart — user confirms the blueprint first |
| `/easysk audit` | Check ALL skills against the checklist; one compliance table | the table is shown; nothing changed |
| `/easysk fix <name>` | Move an existing skill INTO the structure — form only, zero behavior change | the new file is written and every inventory item is ticked — user approves the draft first |
| `/easysk improve <name>` | Upgrade a skill's content — from evidence only, via a proposal | the approved changes are applied — user approves each one |
| `/easysk rebuild <name>` | Rebuild a patched skill whole — same behavior, every rule re-derived with its source, contradictions and dead rules deleted on the user's ruling | a fresh file is swapped in and every rule is accounted for — user approves the outline first |

Natural phrases work too: "create a skill for X", "audit the skills", "fix
the deploy skill", "rebuild that skill", "refactor that skill".

## The standard structure (the audit checklist)

Every skill must pass C1–C8. This list IS the compliance table's columns —
audit adds nothing and skips nothing.

| # | Check |
|---|---|
| C1 | **Folder**: `<skills dir>/<name>/` with `SKILL.md`, `references/` (material the skill reads while running), `best-practice/` (the learning library) and a `.gitignore` that ignores `data/`. An optional `evals/` folder holds skill-creator test cases. A tool-shaped skill — one that ships a runner, drivers or a rule set — may fill the two content folders with its own equivalents, if `SKILL.md` names the mapping. Empty folders that pass a check teach nobody |
| C2 | **Frontmatter**: `name` matches the folder; `description` carries what + when + explicit trigger phrases (incl. `/<name>`), written **pushy** (names contexts where it fires even unnamed), near **~50 words, 80 max** — every description is loaded into every session, so detail lives in the body; `argument-hint` present |
| C3 | **Shape**: overview first (what it is + hard rule + "How to call it" table, each command with its done condition), then numbered steps, **each step ending with its own json trace fragment** — or one complete trace example covering all steps. Under 500 lines; overflow moves into `references/`; a reference file over 300 lines gets a table of contents |
| C4 | **Run trace rule stated**: every run writes `data/runs/<KEY>--<UTC timestamp>--<discriminator>.json`. `<KEY>` is the work-item key (for example a ticket) or the literal `NOTICKET`; the timestamp is `YYYYMMDDTHHMMSSZ`. The file opens with a `_meta` block (`schema`, `ticket`, `skill`, `run_id`, `startedAt`, `endedAt`) and each step writes its record when it finishes |
| C5 | **Library**: `best-practice/` is committed and holds REAL artifacts (a real run trace, real benchmarks with why they worked); it grows by propose-then-approve only |
| C6 | **Wired**: when the project keeps its skills in a source folder (`skills/`), every harness folder the project uses (`.claude/skills/`, `.agents/skills/`, …) holds a symlink resolving to `../../skills/<name>`. No symlink = not loaded. `easysk wire` owns the links; never write one by hand |
| C7 | **Skill dependencies**: a `## Skill dependencies` section lists every skill this one **calls** (runs, or tells the user to run), one bullet each with where it is used, or the single bullet `- none`. A skill that is only mentioned is not a dependency. Every listed name must exist and pass C6. `easysk check` checks it |
| C8 | **Project rules**: whatever the project's own instructions require of a skill (a row in a skills index, a log entry, a language, a prose check) is met. A project with no such rules passes |

## Where skills live

Author in `skills/<name>/` (committed). `.claude/skills/<name>` and
`.agents/skills/<name>` are ignored symlinks to it — what each harness loads.
A project with no `skills/` folder keeps skills straight in `.claude/skills/`;
C6 is then not applicable. A new skill shows up only after a restart.

A skill installed by a package tool (`npx skills add`) lives where that tool
put it — usually `.agents/skills/<name>`, with `.claude/skills/<name>` linking
to it. It is vendored: audit gives it C6 only, and nothing here moves it.

```bash
# from the project root
easysk wire [--dry-run]          # link every skill into every harness folder, drop dead links
easysk check [name...]           # C1–C4, C6, C7; C5 and C8 come back as "manual"
```

Commit the source folder only. CLI settings, the `data/` permission rule
and other traps: [`references/repo-mechanics.md`](references/repo-mechanics.md).

## Run trace

Every run of this skill writes
`data/runs/<KEY>--<UTC timestamp>--<command>--<target>.json` (machine-local,
ignored by git; add `-2` if the name exists). Skill work rarely has a work
item, so `<KEY>` is usually the literal `NOTICKET`. **Each step writes its
record when it finishes — never at the end**, even before an approval gate:
the trace is the only file a command may write before the user says yes.
Values stay short. A step with nothing to do fast-forwards with one line in
`skipped`: execution may skip, structure never does. The file opens with a
`_meta` envelope ([`references/skill-template.md`](references/skill-template.md)
has the example); `endedAt` is never backfilled.

---

## Command: create — co-design first, build last

The user tells easysk what they want; the skill designs the new skill
WITH them, and only builds after an explicit final yes. **Nothing touches
the project before Step 4 is approved** — the run trace is the one exception.
A rejected proposal is rethought, not defended.

### Step 0 — dedup + enumerate

List what exists: the skills folder AND the session's available-skills list
(they differ when symlinks are missing — that difference is itself a
finding). A near-duplicate exists → propose extending it instead. If only the
LOGIC overlaps, propose a **thin entry over shared logic**: sink the logic
into one skill and make the new skill a one-line entry that calls it. A new
standalone skill is the fallback, not the default.

```json
"step0": { "existing": 35, "loaded": 35,
           "nearDuplicates": ["<name> — why it overlaps (or none)"],
           "verdict": "new skill | extend <name> | thin entry over <name>" }
```

### Step 1 — understand (question loop)

Map the need as a design tree; the **frontier** decides which question is
ready to ask — **order only, never message size**. Delivery follows the
user's pacing: **ONE question per message**, batched only when they ask for
speed. Every question carries a recommended answer ("I suggest X because
Y"), and a fact the environment can answer is looked up, never asked.

Cover across the rounds: purpose; who uses it; trigger phrases the user
would actually type; does it **post externally** under an identity
(issue tracker, chat, email) → identity-registry pattern + explicit-approval
gates; which tools and credentials; known traps; the explicit done
condition (checked again at Step 4). The loop exits only when the frontier is
empty AND the user confirms the one-line summary of what they want.

```json
"step1": { "rounds": 2, "questionsAsked": 6,
           "frontier": ["r1: Q1-Q3 independent", "r2: Q4-Q6 unlocked by Q1+Q2"],
           "recommendedAccepted": 4,
           "factsLookedUp": ["<fact> — found in <where>, not asked"],
           "understood": "one-line summary the user confirmed" }
```

### Step 2 — propose the step list (loop until confirmed)

Show the new skill's numbered steps — one line each, no detail yet. The user
confirms, or says what is wrong → rethink and propose a NEW list (not a
patched defense of the old one). The confirmed list is the skeleton contract
for everything after.

```json
"step2": { "proposals": 2,
           "rejected": ["v1 — user: <why in their words>"],
           "confirmedSteps": ["0 <verb>", "1 <verb>", "..."] }
```

### Step 3 — detail every step together (incl. command suggestions)

Walk the confirmed list one step at a time: what the step does, what it asks
the user, its json trace fragment, how it can fail. Questions follow the
Step 1 rules. In the same pass, **propose the "How to call it" command
table** — commands and arguments for the user to accept, change or drop.
Write traps down with dates as they come up.

```json
"step3": { "stepsDetailed": 5,
           "commandsProposed": 3, "commandsAccepted": 2,
           "changes": ["step 2 — user swapped the source order"] }
```

### Step 4 — final confirmation (the build gate)

Show the whole blueprint in one message: confirmed steps + their details +
the command table + triggers + folder plan + **an explicit done condition per
command** — the state that counts as finished, and whether it needs the
user's confirmation before the skill acts. A blueprint missing a done
condition does not pass this gate. Build starts ONLY on an explicit "yes,
build it". Anything less → back to Step 2 or 3.

```json
"step4": { "blueprint": "shown in full",
           "doneConditions": ["<command>: <finish state> — user confirm: yes|no"],
           "outcome": "approved | back to step2 | back to step3" }
```

### Step 5 — build, wire, verify

Only now touch disk. Write from
[`references/skill-template.md`](references/skill-template.md); a filled-in
trace to copy is
[`best-practice/example-run-trace.json`](best-practice/example-run-trace.json).
Seed the new skill's `best-practice/` with its first page. Meet the project's
own rules (C8): its index row, its log entry, its language and prose checks.
Wire with `easysk wire`, check with `easysk check <name>`, then have the user
restart the session and confirm `/<name>` shows up — a missing symlink is the
usual cause of a no-show. When skill-creator is available, write
`evals/trigger-evals.json` with the user and run the trigger eval; a failing
query becomes a description proposal, not an edit
([`references/skill-creator.md`](references/skill-creator.md)).

```json
"step5": { "written": true, "projectRules": "index row + log entry | none defined",
           "symlink": "created in every harness folder + resolves",
           "depsCheck": "clean", "loadedAfterRestart": "user confirmed | pending",
           "skillCreator": "trigger 18/20 | not available — <reason>" }
```

---

## Command: audit

### Step 0 — enumerate

Both listings (skills folder + available list) and `easysk check`. Every
folder with a `SKILL.md` is audited — no sampling, no skipping. Vendored
skills get C6 only: take their names from the project's instructions or
skills index and pass them as `easysk check --vendored a,b`. When nothing
names any, treat every skill as the project's own and say so in one line of
the report — never stop to ask.

```json
"step0": { "folders": 35, "loaded": 33, "missingSymlinks": 2, "vendored": 3 }
```

### Step 1 — check each skill

Score every skill against C1–C8. A check either passes or gets a one-line
reason. No judgment calls beyond the checklist — audit measures, fix repairs.
A `fail` from `easysk check` stands. Read the file only for what the tool
cannot settle: its `manual` checks (C5 real artifacts, C8 project rules),
whether a C2 description is pushy, and whether a tool-shaped skill names its
C1 folder mapping.

```json
"step1": { "<name>": { "pass": ["C1","C2"], "fail": { "C6": "no symlink" } } }
```

### Step 2 — report

One table: skill × C1–C8, sorted worst first, with a closing count ("N of M
compliant"). Suggest `fix <name>` for the worst offenders; change nothing.

```json
"step2": { "compliant": 30, "total": 35, "worst": ["<name>", "<name>"] }
```

---

## Command: fix

Form only. **Zero behavior change**: triggers, hard rules, traps and commands
come out identical — only the shape becomes standard.

### Step 0 — content inventory

Read the old skill and extract EVERY rule, trap, command and trigger into a
numbered list. This list is the contract for the whole fix.

```json
"step0": { "skill": "<name>", "inventory": 23,
           "items": ["1: <one line each>", "..."] }
```

### Step 1 — map into the template

Rebuild the skill in the standard shape, then tick every inventory item off
against the new file. Unmatched items are shown to the user in red — left
out only if the user says so, with the reason recorded.

```json
"step1": { "matched": 22, "unmatched": ["7: <item> — user approved drop: <reason>"] }
```

### Step 2 — approve, write, wire

Show the draft + the tick list. On approval: write, wire, run
`easysk check <name>`, note the restart. fix is an edit, so it adds no log
entry of its own unless the project's rules ask for one.

```json
"step2": { "outcome": "written | abandoned", "wired": "symlink ok, deps clean" }
```

---

## Command: improve

Content, from evidence only. "Make it better" with no evidence is refused —
that is how working skills get broken.

### Step 0 — gather evidence

Only four sources count: (1) the skill's own `data/runs/` traces — repeated
failures, repeated skips, repeated questions that a registry should cache;
(2) user feedback, quoted; (3) a benchmark the user pointed at; (4) a failed
query or expectation from a skill-creator eval, when it is available
([`references/skill-creator.md`](references/skill-creator.md)). **Your own
reading of the file is not evidence.** A bug you spot is a candidate: show it,
and it becomes evidence only when the user confirms it in their own words.

```json
"step0": { "skill": "<name>", "traces": 9,
           "evidence": ["runs: asked for the channel 4 times — should be cached",
                        "user: '<quote>'"] }
```

### Step 1 — propose

Evidence → suggested change, one pair per line. **A change touching
`description` is flagged on its own** — it changes WHEN the skill fires, a
bigger blast radius than any body edit. A description proposal may come from
skill-creator's `--optimize`: trim it to C2 first and show both scores. No
file changes yet.

```json
"step1": { "proposals": 3, "descriptionChange": "flagged: adds trigger 'X' | none" }
```

### Step 2 — approve + apply

Apply only what the user approved. **Approval is per proposal, given after
the user has seen it.** A blanket go-ahead ("change whatever you think is
best", "just fix it") is not approval, however much time pressure comes with
it: answer with the numbered proposals and ask which ones to apply. Library
additions follow the same flow. The trace closes with what shipped.

```json
"step2": { "approved": 2, "rejected": 1, "applied": ["<one line each>"] }
```

---

## Command: rebuild — the file is written again, not edited

For a skill that grew by patching: rules that contradict each other, dead
paths, lines nobody can explain. `rebuild` derives the skill again from its
own rules — the **only command that may delete a rule**, and the only one
that **must produce a new file**; an in-place edit is a patch whatever it is
called. Commands and judgment calls:
[`references/rebuild-flow.md`](references/rebuild-flow.md). Vendored skills
are skipped.

### Step 0 — freeze the old version (never a backup folder)

**First confirm the skill is actually patched** — read it. A skill written
in two days with no contradictions needs `improve`, not `rebuild`. No patch
shape → stop. Then freeze: the old version is a **git SHA**, the tree must be
clean or the SHA is not that version, and a snapshot goes to
`data/rebuilds/<date>/` — **show the path and the rollback line**.

```json
"step0": { "skill": "<name>", "sha": "<40 hex>", "treeClean": true,
           "snapshot": "data/rebuilds/<date>/ (shown to the user)" }
```

### Step 1 — rule inventory with provenance

Extract EVERY rule, trap, command and trigger (fix Step 0's inventory), then
add two columns: **where it came from** (`git log -S` on a distinct phrase →
date + subject + work item) and **evidence** (`data/runs/` firing or skipping
it). Each item ends `keep` (a date, a reason or evidence), `unproven` (none of
the three — a deletion candidate) or `dead` (names a path, key or skill that
is gone). This inventory, not the old file, is what Step 4 writes from.

```json
"step1": { "items": 41, "keep": 30, "unproven": 8, "dead": 3,
           "noProvenance": ["12: <rule> — no commit found"] }
```

### Step 2 — conflict list, one ruling at a time

Two kinds: **inside** the skill (two rules for one situation) and **across**
skills (another claims the same trigger or writes the same file). Anything
the environment can settle — a raw API read, the live config, a real
message — is settled, not asked; the rest reaches the user one question at a
time with a recommended answer. Two rules are never merged silently.

```json
"step2": { "internal": 2, "crossSkill": 1, "settledByEvidence": 2,
           "rulings": ["parent format: user kept the newer one"] }
```

### Step 3 — the new outline (the write gate)

One message: **the outline of the new file** — every section and step — plus
what moves into `references/`, the **delete list with a reason per line**,
the `description` diff on its own, and the line count before → after. **An
outline matching the old file's is not a rebuild**: back to Step 2 for the
shape the rules actually want. Nothing outside `data/` changes before an
explicit yes.

```json
"step3": { "delete": 9, "movedToReferences": 2, "lines": "438 -> 402",
           "outlineChange": "8 actions: one 22-line bullet -> a table",
           "outcome": "approved | back to step2" }
```

### Step 4 — write a NEW file; the old one is read-only

**No `Edit`, no `sed`, no string replacement on the old file.** Write the new
`SKILL.md` to a fresh path from the template + the Step 1 inventory + the
Step 3 outline, then swap it in. Editing in place is `fix` wearing rebuild's
name: the patch shape it was called to remove survives. Then match every
Step 1 item against the new file — `kept`, `moved`, `deleted` on the user's
ruling; an unmatched item is shown in red.

```json
"step4": { "writtenFresh": true, "kept": 30, "moved": 2, "deleted": 9,
           "carriedVerbatim": "112 of 402 lines", "unmatched": [] }
```

### Step 5 — verify, wire, record

Meet the project's own rules (C8), run `easysk check <name>`, and write a
record of the rebuild — the old SHA, the delete list and the carried-verbatim
count — wherever the project keeps its skill history (a log file, the commit
message). It is the only time rules leave a skill, so it earns the record.
When skill-creator is available, run the output eval with the Step 0 snapshot
as the baseline: an expectation that passed before and fails now is a
regression — show it and offer the rollback before calling the rebuild done.
Otherwise the next real run after a restart is the proof; if it misbehaves,
`git checkout <sha> -- <skills dir>/<name>`.

```json
"step5": { "projectRules": "met", "symlink": "resolves", "depsCheck": "clean",
           "record": "old sha + delete list",
           "skillCreator": "new 5/6, old 5/6, no regression | not available",
           "verifiedOnNextRun": "pending" }
```

---

## Skill dependencies

- none

Optional, not a project skill: Anthropic's `skill-creator`, for measurement
only. When `easysk eval` cannot find it, every step that would use it is
skipped and says so in the trace.

## Hard rules

- Never write a real file into a harness folder (`.claude/skills/`,
  `.agents/skills/`) — a package tool's own installs are the one exception —
  and never reach a skill's files through a symlink path: author in the source
  folder and write `<skills dir>/<name>/data/...`. A `.claude/` path triggers
  Claude Code's own-settings protection, which always prompts. Never
  reintroduce copy-based sync.
- No machine-specific absolute paths (`/Users/<name>/...`) in a skill — paths
  are relative to the project root.
- A description without trigger phrases is a skill that never fires.
- Every question carries a recommended answer, and a fact the environment can
  answer is never asked.
- Restating what the model already knows is noise — record what is true HERE:
  this project's endpoints, conventions and traps, with dates.
- fix and improve never run in the same pass — form first, content second,
  each with its own approval.
- `rebuild` is the only command that may delete a rule; `fix` and `improve`
  never do. Each deletion is the user's ruling, one rule at a time.
- Never create a `backup/` folder inside a skill: the old version is a git
  SHA. A folder under the skill is stored twice AND reaches the session
  through the symlink, so retired rules return as live context.

## Library

- [`references/skill-template.md`](references/skill-template.md) — the
  skeleton every new skill starts from (create Step 5, fix Step 1).
- [`references/rebuild-flow.md`](references/rebuild-flow.md) — the commands
  behind rebuild Steps 0–5.
- [`references/repo-mechanics.md`](references/repo-mechanics.md) — CLI
  settings and the `data/` write permission.
- [`references/skill-creator.md`](references/skill-creator.md) — when and how
  skill-creator measures a skill, and what it may never do.
- [`best-practice/example-run-trace.json`](best-practice/example-run-trace.json)
  — the real trace of this skill's own creation. It predates the `_meta`
  envelope: copy its step shape, take `_meta` from the template.
