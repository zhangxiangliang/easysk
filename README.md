<div align="center">

# easysk

Keep every AI skill in your project in one shape, and stop old skills from rotting.

[English](README.md) · [简体中文](README.ZH.md)

[![npm](https://img.shields.io/npm/v/easysk.svg)](https://www.npmjs.com/package/easysk)
[![CI](https://github.com/zhangxiangliang/easysk/actions/workflows/ci.yml/badge.svg)](https://github.com/zhangxiangliang/easysk/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/easysk.svg)](https://github.com/zhangxiangliang/easysk/blob/main/LICENSE)
[![zero deps](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://github.com/zhangxiangliang/easysk/blob/main/package.json)

</div>

easysk checks every skill in your project against one list, and fixes them with you — never without your yes.

## Install

```bash
npx skills add zhangxiangliang/easysk          # as a skill (pick Symlink)
claude mcp add easysk -- npx -y easysk@1 mcp   # or over MCP
```

Then type a command:

| Command | What it does |
|---|---|
| `/easysk audit` | Checks every skill. Changes nothing. |
| `/easysk <idea>` | Designs a new skill with you, then builds it. |
| `/easysk fix <name>` | Moves a skill into the standard shape. What it does stays the same. |
| `/easysk improve <name>` | Changes a skill, but only from evidence: run logs, your words, a failed test. |
| `/easysk rebuild <name>` | Writes a patched skill again from scratch. The only command that may delete a rule. |

On the command line, `npx easysk check` and `npx easysk wire` do the checking and linking without an AI.

## License

MIT © [zhangxiangliang](https://github.com/zhangxiangliang)
