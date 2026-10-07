<div align="center">

# easysk

Keep every AI skill in your project in one shape, and stop old skills from rotting.

[English](README.md) · [简体中文](README.ZH.md)

[![CI](https://github.com/zhangxiangliang/easysk/actions/workflows/ci.yml/badge.svg)](https://github.com/zhangxiangliang/easysk/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/zhangxiangliang/easysk.svg)](https://github.com/zhangxiangliang/easysk/blob/main/LICENSE)
[![needs](https://img.shields.io/badge/needs-bash%20%2B%20git-brightgreen.svg)](#quick-start)

</div>

Skills start small. Then something goes wrong, and you add a line. Two months
later the skill has thirty patches, two rules that say opposite things, and
nobody knows why half the lines are there. Some skills do not even load,
because a link is missing — and nothing tells you.

easysk gives your AI one skill, `/create-skill`, that looks after all the
others:

| Command | What it does |
|---|---|
| `/create-skill <idea>` | Designs a new skill with you, one question at a time. Builds it only after you say yes. |
| `/create-skill audit` | Checks every skill against one list of 8 checks. Changes nothing. |
| `/create-skill fix <name>` | Moves a skill into the standard shape. What it does stays the same. |
| `/create-skill improve <name>` | Changes a skill, but only from evidence: run logs, your words, a test. |
| `/create-skill rebuild <name>` | Writes a patched skill again from scratch. The only command that may delete a rule — and only when you say so. |

## Quick start

### With the skills CLI

```bash
npx skills add zhangxiangliang/easysk
```

Pick **Symlink** when it asks how to install. Restart your session, then type
`/create-skill`.

Why Symlink: the skill writes a log of every run into its own `data/` folder.
With Symlink the real folder sits in `.agents/skills/`, and those writes just
work. A copy lands inside `.claude/`, which Claude Code guards, so every log
write asks you first. (`-y` with a single agent makes a copy.)

### Without the CLI

If you keep your own skills in a `skills/` folder — the layout easysk
recommends:

```bash
git clone --depth 1 https://github.com/zhangxiangliang/easysk.git /tmp/easysk
mkdir -p skills && cp -R /tmp/easysk/skills/create-skill skills/
skills/create-skill/scripts/wire-skills.sh
```

`wire-skills.sh` links every folder in `skills/` into `.claude/skills/` (and
`.agents/skills/` if you have one). Add those two folders to `.gitignore`, so
only `skills/` is committed:

```
.claude/skills/
.agents/skills/
```

Needs `git` and `bash`: macOS, Linux, or WSL / Git Bash on Windows. Optional:
Python 3.10+ with Anthropic's `skill-creator`, for the test steps below.

## See it work

A small project with four skills. `release-notes` is well kept. `deploy-docs`
has been patched for months. `hotfix` was never linked. The fourth is
create-skill itself.

```
/create-skill audit
```

This is the real reply, cut short:

> | Skill | C1 Folder | C2 Front-matter | C3 Shape | C4 Trace | C5 Library | C6 Wired | C7 Deps | C8 Project rules |
> |---|---|---|---|---|---|---|---|---|
> | **hotfix** | ❌ only has `SKILL.md` | ❌ 3-word description, no triggers | ❌ talks about "Step 1" and "Step 2", but those steps don't exist | ❌ | ❌ | ❌ **no symlink, so it never loads** | ❌ declares `bump-version`, which doesn't exist | ✅ |
> | **deploy-docs** | ❌ only has `SKILL.md` | ❌ `"deploy the docs"`: no triggers | ❌ no overview, hard rule or table | ❌ | ❌ | ✅ | ❌ no section, but it calls `release-notes` | ✅ |
> | **release-notes** | ✅ | ✅ (44 words) | ✅ | ✅ | ❌ `best-practice/seed.md` is a placeholder | ✅ | ✅ | ✅ |
> | **create-skill** | ✅ | ✅ (73 words, under the 80 max) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
>
> **1 of 4 compliant.**
>
> **`deploy-docs` contradicts itself, and following it is risky.** Line 9 says
> "ALWAYS use the staging bucket first". Line 11 (dated 2026-09-02) says "NEVER
> upload to staging, it was removed". `fix` changes only the form, so it would
> carry this contradiction into a nicer-looking file. The right command is
> `rebuild deploy-docs`.

Two things to notice. `hotfix` was never loaded, and nothing else would have
told you. And the audit read the files, not just the checklist: it found the
two rules that fight, and picked the one command that is allowed to settle
them.

The wiring and dependency columns come from a plain script you can run
yourself:

```
$ skills/create-skill/scripts/check-skill-deps.sh
FAIL deploy-docs C7: no '## Skill dependencies' section
NOTE deploy-docs C7 candidate: mentions 'release-notes' but does not declare it
FAIL hotfix C6 .claude/skills: no symlink
FAIL hotfix C7: declared 'bump-version' does not exist in skills/
check-skill-deps: checked=4 fail=3 note=1 (folders: .claude/skills)
```

## The checklist

Every skill must pass all eight. Audit adds nothing and skips nothing.

| # | Check |
|---|---|
| C1 | **Folder** — `SKILL.md`, `references/`, `best-practice/`, and a `.gitignore` for `data/` |
| C2 | **Front matter** — the name matches the folder; the description says what, when, and the words that trigger it; about 50 words, 80 at most |
| C3 | **Shape** — overview and command table first, then numbered steps; under 500 lines |
| C4 | **Run log** — every run writes one to `data/runs/`, step by step |
| C5 | **Library** — `best-practice/` holds real examples, added only with your yes |
| C6 | **Wired** — linked into every harness folder. No link, not loaded |
| C7 | **Dependencies** — a `## Skill dependencies` section names every skill it calls, and they exist |
| C8 | **Your rules** — whatever your `CLAUDE.md` or `AGENTS.md` asks of a skill |

The full text is in [`SKILL.md`](skills/create-skill/SKILL.md).

## Your project's own rules

The checklist is the same everywhere. Anything that belongs to your project
alone — where skills are listed, which language they use, how prose is
checked — goes in your `CLAUDE.md` or `AGENTS.md`. create-skill reads those
and follows them on top of its own list (check C8).

## With Anthropic's skill-creator

If `skill-creator` is installed, create-skill uses it to **measure**, never
to decide:

* after `create` builds a skill, it tests how often the description fires;
* in `improve`, a failed test counts as evidence, and a better description
  can be proposed;
* after `rebuild`, it runs the same tests on the old and the new version, and
  stops on any drop, with the undo command ready.

Every result still goes through your yes, one at a time. skill-creator's own
"edit the skill" loop is never used. Without it, nothing breaks: those steps
are skipped, and the run log says so.

## What it does not do

* **It does not change a skill without your yes.** "Do whatever you think is
  best" is not a yes.
* **It does not delete a rule quietly.** Only `rebuild` may delete, one rule
  at a time, on your word.
* **It does not rework skills you copied from elsewhere.** Those only get
  checked for wiring.
* **It does not judge style.** Audit is eight checks, each one pass or fail
  with a one-line reason.

## Design

* **Evidence over opinion.** `improve` needs a run log, your words or a failed
  test. The AI's own reading of a file is not evidence.
* **Rewrite, do not patch.** `rebuild` writes a new file. Editing in place is
  how skills rot.
* **Scripts for the dull parts.** Linking and dependency checks are plain
  bash you can run and test — 36 tests, on macOS and Linux, in CI.
* **It follows its own rules.** create-skill passes its own audit, and this
  repo uses the layout it recommends.

## License

MIT © [zhangxiangliang](https://github.com/zhangxiangliang)
