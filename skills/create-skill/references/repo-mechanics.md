# Repo mechanics — the full version

Reference for `create-skill`. `SKILL.md` keeps the short form. Read this when
a script needs a setting, when a write keeps prompting, or when a skill does
not show up in the session.

## The two scripts

Run both from the project root.

```bash
<this skill>/scripts/wire-skills.sh              # wire, replace wrong links, drop dead links
<this skill>/scripts/wire-skills.sh --dry-run    # print what would change, touch nothing
<this skill>/scripts/wire-skills.sh --list-dirs  # print the harness folders it uses

<this skill>/scripts/check-skill-deps.sh         # C6 + C7 for every skill
<this skill>/scripts/check-skill-deps.sh <name>  # only these
```

Settings, all optional, all environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `SKILLS_DIR` | `skills` | the source folder, relative to the project root |
| `HARNESS_DIRS` | `.claude/skills`, plus `.agents/skills` when that folder already exists | space-separated harness folders to wire |
| `VENDORED_SKILLS` | empty | space-separated skill names copied from elsewhere; they get C6 only |

`wire-skills.sh` links every `<SKILLS_DIR>/<name>/` that has a `SKILL.md`
into every harness folder, replaces a link that points somewhere else, and
removes links that point at nothing (a renamed or merged skill leaves one
behind). It never touches a real directory in a harness folder: it reports it
as STALE and stops with exit 1, because a stale copy must be checked by a
person before it goes.

`check-skill-deps.sh` reports, per skill: a harness folder without a
resolving symlink, a `## Skill dependencies` section that is missing, a
declared name that does not exist, and — as things to look at only — skill
names the file mentions but does not declare.

Never reintroduce a copy-based sync: copies go stale and overwrite the
symlinks.

## data/ writes — two rules so traces do not spam permission prompts

Every run writes `data/runs/` several times (one record per step), so a
prompt per write adds up fast.

1. **Always write through the real path** — `skills/<name>/data/...`, NEVER
   through the `.claude/skills/<name>/data/...` symlink. Writes through any
   `.claude/` path trigger Claude Code's own-settings protection, which
   ALWAYS prompts; allow rules cannot silence it, and the grant only lasts
   one session (observed 2026-08-13). The real path is an ordinary file
   write. `npx skills add` with a single agent and `-y` **copies** the skill
   into `.claude/skills/`, so it has no real path outside `.claude/` and
   every trace write prompts; installing with the symlink method puts the
   real folder in `.agents/skills/` instead (observed 2026-10-07).
2. **On a machine that still prompts for ordinary writes**, offer a one-time
   setup: add to the personal `.claude/settings.local.json` (never the
   shared config), under `permissions.allow`:

   ```json
   "Write(skills/*/data/**)",  "Edit(skills/*/data/**)"
   ```

   One glob serves every skill. Traces and registries only — never widen it
   beyond `data/`. Ask once; declining just keeps the prompts.
