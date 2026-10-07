/** Throwaway git projects with skills in them, for the tests. */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const made: string[] = [];

/** A new empty git repo. Removed by `cleanup()`. */
export function newProject(): string {
  const root = mkdtempSync(join(tmpdir(), "easysk-test-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  made.push(root);
  return root;
}

export function cleanup(): void {
  for (const root of made.splice(0)) rmSync(root, { recursive: true, force: true });
}

export function write(root: string, path: string, text: string): void {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/** A bare skill: front matter and a dependency section, nothing else. */
export function addSkill(root: string, name: string, deps = "- none", dir = "skills"): void {
  write(root, `${dir}/${name}/SKILL.md`, `---\nname: ${name}\n---\n\n# ${name}\n\n## Skill dependencies\n\n${deps}\n`);
}

/** A skill that passes every mechanical check (C1–C4, C7). */
export function addGoodSkill(root: string, name: string, dir = "skills"): void {
  write(
    root,
    `${dir}/${name}/SKILL.md`,
    `---
name: ${name}
argument-hint: "[arg]"
description: "Does one thing well. Use when it is needed. Trigger with \\"/${name}\\"."
---

# ${name}

One hard rule: never do the bad thing.

## How to call it

| You type | What happens | Done when |
|---|---|---|
| \`/${name}\` | it runs | done — user confirm: no |

## Run trace — every run writes \`data/runs/<KEY>--<UTC timestamp>--x.json\`

Opens with \`_meta\`.

## Step 0 — start

\`\`\`json
"step0": { "ok": true }
\`\`\`

## Skill dependencies

- none
`
  );
  write(root, `${dir}/${name}/references/notes.md`, "# notes\n");
  write(root, `${dir}/${name}/best-practice/example-run-trace.json`, "{}\n");
  write(root, `${dir}/${name}/.gitignore`, "data/\n");
}
