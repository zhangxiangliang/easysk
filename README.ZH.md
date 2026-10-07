<div align="center">

# easysk

让项目里每个 AI skill 都保持同一个结构，别让老 skill 越改越烂。

[English](README.md) · [简体中文](README.ZH.md)

[![CI](https://github.com/zhangxiangliang/easysk/actions/workflows/ci.yml/badge.svg)](https://github.com/zhangxiangliang/easysk/actions/workflows/ci.yml)
[![license](https://img.shields.io/github/license/zhangxiangliang/easysk.svg)](https://github.com/zhangxiangliang/easysk/blob/main/LICENSE)
[![needs](https://img.shields.io/badge/needs-bash%20%2B%20git-brightgreen.svg)](#快速开始)

</div>

skill 一开始都很小。后来出了一次问题，就加一行；再出一次，再加一行。两个月后，这个
skill 打了三十个补丁，有两条规则说的正好相反，一半的行谁也说不清为什么在那儿。有的
skill 干脆加载不出来——少了个软链接，而且没有任何东西会告诉你。

easysk 给你的 AI 一个 skill：`/create-skill`，专门管其他所有 skill：

| 命令 | 作用 |
|---|---|
| `/create-skill <想法>` | 和你一起设计新 skill，一次只问一个问题。你点头之后才动手建。 |
| `/create-skill audit` | 用同一张 8 项清单检查所有 skill。什么都不改。 |
| `/create-skill fix <名字>` | 把 skill 改成标准结构。它做的事一点不变。 |
| `/create-skill improve <名字>` | 改 skill 的内容，但只凭证据：运行日志、你的原话、测试结果。 |
| `/create-skill rebuild <名字>` | 把打满补丁的 skill 从头重写。唯一能删规则的命令——而且只在你同意时才删。 |

## 快速开始

### 用 skills CLI

```bash
npx skills add zhangxiangliang/easysk
```

问你怎么安装时，选 **Symlink**。重启会话，然后输入 `/create-skill`。

为什么选 Symlink：skill 每次运行都会往自己的 `data/` 文件夹写日志。选 Symlink，真实
文件夹放在 `.agents/skills/`，写日志不会有任何打扰。选复制的话，文件落在 `.claude/`
里，Claude Code 会保护这个目录，每写一次日志都要先问你。（`-y` 加上只选一个 agent，
就会走复制。）

### 不用 CLI

如果你自己的 skill 都放在 `skills/` 文件夹里——也就是 easysk 推荐的结构：

```bash
git clone --depth 1 https://github.com/zhangxiangliang/easysk.git /tmp/easysk
mkdir -p skills && cp -R /tmp/easysk/skills/create-skill skills/
skills/create-skill/scripts/wire-skills.sh
```

`wire-skills.sh` 会把 `skills/` 里的每个文件夹链接进 `.claude/skills/`（有
`.agents/skills/` 的话也一起）。把这两个文件夹加进 `.gitignore`，只提交 `skills/`：

```
.claude/skills/
.agents/skills/
```

需要 `git` 和 `bash`：macOS、Linux，或者 Windows 上的 WSL / Git Bash。可选：
Python 3.10+ 和 Anthropic 的 `skill-creator`，用于下面的测试步骤。

## 看一眼效果

一个有四个 skill 的小项目。`release-notes` 维护得很好；`deploy-docs` 被打了好几个月补丁；
`hotfix` 从来没被链接过；第四个是 create-skill 自己。

```
/create-skill audit
```

下面是真实的回复（有删减，原文是英文）：

> | Skill | C1 文件夹 | C2 头部信息 | C3 结构 | C4 日志 | C5 案例库 | C6 链接 | C7 依赖 | C8 项目规则 |
> |---|---|---|---|---|---|---|---|---|
> | **hotfix** | ❌ 只有 `SKILL.md` | ❌ 描述只有 3 个词，没有触发词 | ❌ 提到了 "Step 1" 和 "Step 2"，但这两步根本不存在 | ❌ | ❌ | ❌ **没有软链接，永远不会加载** | ❌ 声明依赖 `bump-version`，但它不存在 | ✅ |
> | **deploy-docs** | ❌ 只有 `SKILL.md` | ❌ `"deploy the docs"`：没有触发词 | ❌ 没有概述、硬规则和命令表 | ❌ | ❌ | ✅ | ❌ 没有依赖章节，却调用了 `release-notes` | ✅ |
> | **release-notes** | ✅ | ✅（44 词） | ✅ | ✅ | ❌ `best-practice/seed.md` 只是占位 | ✅ | ✅ | ✅ |
> | **create-skill** | ✅ | ✅（73 词，没超过 80） | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
>
> **4 个里 1 个合规。**
>
> **`deploy-docs` 自相矛盾，照着做有风险。** 第 9 行说"ALWAYS 先传 staging bucket"，
> 第 11 行（2026-09-02 加的）说"NEVER 传 staging，它已经删了"。`fix` 只改结构，
> 会把这个矛盾原样搬进一个更好看的文件。该用的命令是 `rebuild deploy-docs`。

注意两点。`hotfix` 从来没加载过，除了它没有任何东西会告诉你。另外，audit 不只是对照清单打勾——
它读了文件内容，找出了两条打架的规则，还选出了唯一有权处理这件事的命令。

链接和依赖那两列，来自一个你自己也能跑的普通脚本：

```
$ skills/create-skill/scripts/check-skill-deps.sh
FAIL deploy-docs C7: no '## Skill dependencies' section
NOTE deploy-docs C7 candidate: mentions 'release-notes' but does not declare it
FAIL hotfix C6 .claude/skills: no symlink
FAIL hotfix C7: declared 'bump-version' does not exist in skills/
check-skill-deps: checked=4 fail=3 note=1 (folders: .claude/skills)
```

## 检查清单

每个 skill 八项都要过。audit 不多查，也不少查。

| # | 检查项 |
|---|---|
| C1 | **文件夹**——有 `SKILL.md`、`references/`、`best-practice/`，以及忽略 `data/` 的 `.gitignore` |
| C2 | **头部信息**——名字和文件夹一致；描述写清做什么、什么时候用、靠哪些词触发；50 词左右，最多 80 |
| C3 | **结构**——先放概述和命令表，再放编号步骤；不超过 500 行 |
| C4 | **运行日志**——每次运行都往 `data/runs/` 写一份，一步写一条 |
| C5 | **案例库**——`best-practice/` 里放真实案例，你同意了才往里加 |
| C6 | **链接**——链接进每个 harness 文件夹。没链接，就不加载 |
| C7 | **依赖**——用 `## Skill dependencies` 章节列出它调用的每个 skill，而且这些 skill 都存在 |
| C8 | **你的规则**——你的 `CLAUDE.md` 或 `AGENTS.md` 对 skill 提的要求 |

完整内容见 [`SKILL.md`](skills/create-skill/SKILL.md)。

## 你项目自己的规则

清单在哪儿都一样。只属于你项目的东西——skill 登记在哪里、用什么语言写、文字怎么检查——
写进你的 `CLAUDE.md` 或 `AGENTS.md`。create-skill 会读这些文件，在自己的清单之外照做（C8）。

## 配合 Anthropic 的 skill-creator

如果装了 `skill-creator`，create-skill 会用它来**测量**，但从不让它做决定：

* `create` 建好 skill 后，测一下描述的触发准不准；
* `improve` 时，没通过的测试算作证据，也可以据此提议一个更好的描述；
* `rebuild` 后，用同一套测试分别测新旧两个版本，只要变差就停下，回滚命令已经准备好。

每个结果仍然要你逐条同意。skill-creator 自带的"自动改 skill"循环永远不会被用到。
没装它也没关系：这些步骤会跳过，运行日志里会写明。

## 它不做什么

* **不经你同意，不改任何 skill。** "你看着办"不算同意。
* **不会悄悄删规则。** 只有 `rebuild` 能删，一次删一条，要你点头。
* **不会改动你从别处拷来的 skill。** 这类 skill 只检查链接。
* **不评判写作风格。** audit 就是八项检查，每项要么通过，要么附一行理由。

## 设计取向

* **证据优先，不凭感觉。** `improve` 需要运行日志、你的原话或没通过的测试。AI 自己读一遍文件的感觉，不算证据。
* **重写，而不是打补丁。** `rebuild` 会写一个新文件。原地修修补补，正是 skill 变烂的原因。
* **机械活交给脚本。** 链接和依赖检查都是能自己跑、能测试的普通 bash——36 个测试，在 macOS 和 Linux 上由 CI 跑。
* **自己守自己的规矩。** create-skill 能通过自己的 audit，这个仓库用的也正是它推荐的结构。

## 许可

MIT © [zhangxiangliang](https://github.com/zhangxiangliang)
