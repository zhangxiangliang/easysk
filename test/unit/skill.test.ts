/**
 * The shipped skill follows its own rules. If easysk fails its own audit,
 * nothing it says about other skills is worth much.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { check } from "../../src/check";
import { countWords, parseFrontMatter } from "../../src/frontmatter";
import { resolveLayout } from "../../src/layout";

const repo = join(__dirname, "../..");
const skillDir = join(repo, "skills/easysk");

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    if (f === "data") return []; // machine-local, never shipped
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

describe("skills/easysk", () => {
  it("passes every mechanical check of its own list", () => {
    const layout = { ...resolveLayout({ cwd: repo }), hasSource: true, skillsDir: "skills" };
    const s = check(layout, { names: ["easysk"] }).skills[0]!;
    for (const id of ["C1", "C2", "C3", "C4", "C7"] as const) {
      expect([id, s.checks[id].reasons]).toEqual([id, []]);
    }
  });

  it("keeps its description within the word cap", () => {
    const fm = parseFrontMatter(readFileSync(join(skillDir, "SKILL.md"), "utf8"));
    expect(countWords(fm.fields.description!)).toBeLessThanOrEqual(80);
  });

  it("names no install path and no old script of its own: it must run wherever it lands", () => {
    for (const f of files(skillDir)) {
      const text = readFileSync(f, "utf8");
      expect([f, text.match(/skills\/(create-skill|easysk)\/|scripts\/[a-z-]+\.sh/)?.[0]]).toEqual([f, undefined]);
    }
  });
});
