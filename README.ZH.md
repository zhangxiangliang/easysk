<div align="center">

# easysk

让项目里每个 AI skill 都保持同一个结构，别让老 skill 越改越烂。

[English](README.md) · [简体中文](README.ZH.md)

[![npm](https://img.shields.io/npm/v/easysk.svg)](https://www.npmjs.com/package/easysk)
[![CI](https://github.com/zhangxiangliang/easysk/actions/workflows/ci.yml/badge.svg)](https://github.com/zhangxiangliang/easysk/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/easysk.svg)](https://github.com/zhangxiangliang/easysk/blob/main/LICENSE)
[![zero deps](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://github.com/zhangxiangliang/easysk/blob/main/package.json)

</div>

easysk 用同一张清单检查项目里的每个 skill，并和你一起修好它们——不经你同意，绝不动手。

## 安装

```bash
npx skills add zhangxiangliang/easysk          # 作为 skill 安装（选 Symlink）
claude mcp add easysk -- npx -y easysk@1 mcp   # 或者用 MCP
```

然后输入命令：

| 命令 | 作用 |
|---|---|
| `/easysk audit` | 检查所有 skill。什么都不改。 |
| `/easysk <想法>` | 和你一起设计新 skill，然后建出来。 |
| `/easysk fix <名字>` | 把 skill 改成标准结构。它做的事一点不变。 |
| `/easysk improve <名字>` | 改 skill 的内容，但只凭证据：运行日志、你的原话、没通过的测试。 |
| `/easysk rebuild <名字>` | 把打满补丁的 skill 从头重写。唯一能删规则的命令。 |

在命令行里，`npx easysk check` 和 `npx easysk wire` 不用 AI 也能检查和建链接。

## 许可

MIT © [zhangxiangliang](https://github.com/zhangxiangliang)
