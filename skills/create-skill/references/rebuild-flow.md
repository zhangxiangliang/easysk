# rebuild — the full procedure

Reference for `create-skill rebuild <name>`. `SKILL.md` carries the six steps
and their trace fragments; this file carries the commands and the judgment
calls behind them. `<skills dir>` below is the project's source folder,
usually `skills`.

`rebuild` is the one command with delete power, and it pays for that power
with provenance: a rule is only deleted when the history shows it is dead or
beaten.

## 1. Which command does this job

| The skill is | Command |
|---|---|
| in the wrong shape, content fine | `fix` |
| missing something, evidence in hand | `improve` |
| full of patches, rules fighting each other | `rebuild` |

`rebuild` does not change what the skill does. If the user wants new
behavior, that is `improve` first or after — never inside the same pass.

## 2. Step 0 — freeze the old version

```bash
git status --porcelain <skills dir>/<name>              # must be empty
git log -1 --format=%H -- <skills dir>/<name>           # the SHA to record
mkdir -p <skills dir>/<name>/data/rebuilds/$(date +%F)
cp -R <skills dir>/<name>/SKILL.md <skills dir>/<name>/references <skills dir>/<name>/best-practice \
      <skills dir>/<name>/data/rebuilds/$(date +%F)/    # ignored snapshot
```

Rollback, at any point later:

```bash
git checkout <sha> -- <skills dir>/<name>
```

**Never a `backup/` folder inside the skill.** Git already stores every old
version, so a folder is a second copy that lives forever; worse, everything
under the skill reaches the session through the harness symlink, so the
retired rules would come back as live context and re-create the
contradictions the rebuild just removed.

A dirty tree means the SHA is not the version on disk. Offer to commit the
loose patches first — do not stash them away, they are part of what is being
rebuilt.

## 3. Step 1 — provenance for every rule

Start from `fix` Step 0's inventory: every rule, trap, command, trigger, one
numbered line each. Then answer two questions per item.

**Where did it come from?** Pick a distinct phrase from the line and search
the history of the file:

```bash
git log -S "<distinct phrase>" --format='%ad %h %s' --date=short -- <skills dir>/<name>
git log -L '/<distinct phrase>/,+1:<skills dir>/<name>/SKILL.md' --format='%ad %s' --date=short
```

`-S` finds the commit that added or removed the phrase; `-L` follows that line
through renames and rewrites. Read the commit subject and body: a work-item
key or an incident in the body IS the provenance.

**Does it still fire?** Traces are machine-local, so this is evidence only on
the machine that ran the skill:

```bash
grep -rl "<key from the trace fragment>" <skills dir>/<name>/data/runs/ | wc -l
grep -rho '"skipped": *\[[^]]*\]' <skills dir>/<name>/data/runs/ | sort | uniq -c | sort -rn
```

Then label each item:

| Label | Meaning | Fate |
|---|---|---|
| `keep` | has a date, a stated reason, or trace evidence | stays, wording may change |
| `unproven` | none of the three | deletion candidate — needs a ruling |
| `dead` | names a path, skill, folder or flag that no longer exists | deletion candidate, with the proof |

Checking `dead` is a real lookup, never a guess:

```bash
ls <path named by the rule>                         # path still there?
ls <skills dir>/<other skill named by the rule>     # skill still there?
grep -rn "<flag or command>" . --include='*.md' | head
```

Typical shapes of a dead rule: a folder renamed by a later layout change, or
a skill that was retired into a thin entry over another one.

## 4. Step 2 — the conflict scan

**Inside the skill.** Two items conflict when a single situation makes both
apply and they say different things. The pattern to look for: the same noun
(a message format, a branch, an output path, an approval) described twice with
different detail, usually weeks apart. Sort the inventory by that noun, not by
position in the file — patches land far from the rule they contradict.

**Across skills.** Two cheap checks that catch most of it:

```bash
# another skill claiming the same trigger phrase
for f in <skills dir>/*/SKILL.md; do
  awk '/^description:/{print FILENAME": "$0}' "$f"; done | grep -i "<trigger phrase>"

# another skill writing the same file or folder
grep -rn "<output path pattern>" <skills dir>/*/SKILL.md | grep -v "<skills dir>/<name>/"
```

Every conflict goes to the user as **one question, with a recommended answer
and the two dates** ("the 2026-08-14 rule says X, the 2026-09-04 one says Y —
I suggest keeping the newer one because Z"). Never merge two rules into a
softer third one on your own: that is how a contradiction turns into a rule
nobody can follow.

## 5. Step 3 — the outline is the plan

1. **The outline of the new file**: every section and step it will have, in
   order. This is the part that decides whether a rebuild happened. Compare it
   to the old file's outline — same headings in the same order means nothing
   was re-derived, only edited. Go back to Step 2.
2. What moves into `references/`, with the reason (line budget, or "read only
   during a rare branch").
3. **The delete list** — every dropped item, its label, and one line of proof
   (`dead: the key is gone`, `beaten by #22, 2026-09-04`).
4. The `description` diff on its own line — it decides when the skill fires,
   the biggest blast radius in the file.
5. Lines before → after, and that `SKILL.md` stays under 500.

The usual patch shape is a list that grew by appending — one bullet that
keeps getting longer. A re-derived outline gives it the shape the rules want
(often a table, one row per case) without changing behavior.

No file is touched before an explicit yes. A rejected plan is re-thought, not
defended.

## 6. Step 4 — write a new file, never edit the old one

**The old file is read-only input from here on.** It has already been read
into the Step 1 inventory; that inventory plus the Step 3 outline is what the
new file is written from.

```bash
# write the new one beside the old, then swap
$EDITOR <skills dir>/<name>/SKILL.md.new     # from references/skill-template.md
mv <skills dir>/<name>/SKILL.md.new <skills dir>/<name>/SKILL.md
```

Forbidden in this step: `Edit`, `sed -i`, any string replacement against the
old file. They are what `fix` does, and they produce a patch no matter what
the run is called.

Then the tick-off table — every Step 1 item gets one row:

| # | Item | Fate |
|---|---|---|
| 7 | `<rule>` | kept — now in Step 2 |
| 12 | `<rule>` | moved → `references/<file>.md` |
| 23 | `<rule>` | deleted — user ruling <date>, dead path |

An item with no row, or a row the user did not approve, blocks the run — the
same "never lose content silently" contract `fix` uses. Report the
carried-verbatim count (`git diff --numstat` against the old SHA). A high
number is not a failure by itself, but a rebuild that carries almost
everything did not happen.

## 7. Step 5 — the record

Write it wherever the project keeps skill history — a log file if it has one,
otherwise the commit message:

```markdown
## [YYYY-MM-DD] rebuild | <name>

- **Rebuilt** `<skills dir>/<name>/` via `/create-skill rebuild`: <one line on
  what the skill still does — behavior unchanged>.
- Old version: `<sha>` — restore with `git checkout <sha> -- <skills dir>/<name>`.
- Deleted: <n> rules — <one line each, with the reason>.
- Moved into `references/`: <files>.
- Why: <what the patching had done to the skill>.
```

The record is not optional. `fix` and `improve` only add or reshape; a rebuild
is the only time rules leave a skill, and six months later the SHA in this
record is the only way back.

Close the run: the project's own prose checks, symlink + deps check, a session
restart, and the next real run of the skill is the proof. Keep the snapshot
under `data/rebuilds/` until that run passes.
