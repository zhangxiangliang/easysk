# create-skill

A skill for Claude Code (and other agents that read `SKILL.md` files) that
keeps every skill in a project in one standard shape, for its whole life.

| Command | What it does |
|---|---|
| `/create-skill <idea>` | Designs a new skill with you, one question at a time, and builds it only after you say yes |
| `/create-skill audit` | Scores every skill against one checklist and prints a table; changes nothing |
| `/create-skill fix <name>` | Moves a skill into the standard shape; behavior stays the same |
| `/create-skill improve <name>` | Changes a skill's content, but only from evidence: run traces, your feedback, a benchmark |
| `/create-skill rebuild <name>` | Writes a patched skill again from scratch; the only command that may delete a rule, and only on your say-so |

Why it exists: skills that are only ever patched keep growing. Rules start to
contradict each other, and nobody remembers why a line is there. This skill
makes every change show its evidence, never drops a rule without asking, and
gives you one command (`rebuild`) to clean up.

## With Anthropic's skill-creator

If Anthropic's `skill-creator` is installed, `create-skill` uses it to
**measure**, never to decide:

- after `create` builds a skill, it tests how often the description fires;
- in `improve`, a failed test is evidence, and a better description can be
  proposed (trimmed to the checklist's word limit first);
- after `rebuild`, it runs the same tests on the old and the new version and
  stops on any regression, with the rollback command ready.

Every result still goes through your yes, one proposal at a time;
skill-creator's own "edit the skill" loop is never used. Without it,
nothing breaks: those steps are skipped and the run says so. Details:
[`references/skill-creator.md`](references/skill-creator.md).

## Install

From the root of your project:

```bash
npx skills add zhangxiangliang/easysk          # pick Symlink when asked
```

Or by hand, into your project's `skills/` folder:

```bash
git clone --depth 1 https://github.com/zhangxiangliang/easysk.git /tmp/easysk
mkdir -p skills && cp -R /tmp/easysk/skills/create-skill skills/
skills/create-skill/scripts/wire-skills.sh
```

`wire-skills.sh` links every folder under `skills/` into `.claude/skills/`
(and `.agents/skills/` if you use it). Add those harness folders to
`.gitignore`, so only `skills/` is committed:

```
.claude/skills/
.agents/skills/
```

Restart your session; `/create-skill` is now available. A project without a
`skills/` folder can put the skill straight into `.claude/skills/create-skill/`
instead; check C6 then does not apply.

Needs `git` and `bash`. Optional: Python 3.10+ with Anthropic's
`skill-creator` for the eval steps.

Script settings and the permission note for `data/`:
[`references/repo-mechanics.md`](references/repo-mechanics.md).

## Your project's own rules

The checklist is the same everywhere. Anything that belongs to your project
alone — where skills are registered, which language they use, how prose is
checked — goes in your `CLAUDE.md` or `AGENTS.md`. `create-skill` reads those
and follows them on top of its own checklist (check C8).

## Tests

`tests/run.sh` runs the script tests in throwaway repos.
