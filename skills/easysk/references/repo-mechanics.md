# Repo mechanics — the full version

Reference for `easysk`. `SKILL.md` keeps the short form. Read this when
the CLI needs a setting, when a write keeps prompting, or when a skill does
not show up in the session.

## The CLI

Run it from the project root (the git top level). It prints JSON. `easysk`
below means `npx -y easysk@1`.

```bash
easysk wire                         # link, replace wrong links, drop dead links
easysk wire --dry-run               # print what would change, touch nothing
easysk check                        # every check a program can settle, all skills
easysk check <name>...              # only these
easysk check --vendored a,b         # these keep their upstream shape: C6 only
easysk check --details              # passing checks too (off by default: tokens)
```

Settings, all optional:

| Flag | Variable | Default | Meaning |
|---|---|---|---|
| `--skills-dir` | `SKILLS_DIR` | `skills` | the source folder, relative to the project root |
| `--harness a,b` | `HARNESS_DIRS` (space-separated) | `.claude/skills`, plus `.agents/skills` when that folder already exists | harness folders to wire |
| `--vendored a,b` | `VENDORED_SKILLS` (space-separated) | empty | skills copied from elsewhere; they get C6 only |

`easysk wire` links every `<skills dir>/<name>/` that has a `SKILL.md` into
every harness folder, replaces a link that points somewhere else, and removes
links that point at nothing (a renamed or merged skill leaves one behind). It
never touches a real directory in a harness folder: it reports it as `stale`
and exits 1, because a stale copy must be checked by a person before it goes.
On Windows it makes junctions, which need no admin rights.

`easysk check` returns, per skill, the checks that `fail` with a one-line
reason each, the checks that are `manual` (C5: are the library's files real
artifacts; C8: the project's own rules — said once for all skills), and
`notes`: skill names the file mentions but does not declare, things to look
at only. Exit 1 when any check fails.

Never reintroduce a copy-based sync: copies go stale and overwrite the
symlinks.

The skill folder inside the npm package is runtime material for the MCP
prompt, not an install source: npm drops every `.gitignore` it packs, so a
copy taken from there fails C1 (observed 2026-10-08). Install the skill
with `npx skills add zhangxiangliang/easysk`, which reads GitHub.

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
