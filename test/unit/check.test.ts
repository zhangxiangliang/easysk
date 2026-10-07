import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { check, checkFrontMatter, checkShape, compactReport, countLines, dependencySection } from "../../src/check";
import { resolveLayout } from "../../src/layout";
import { wire } from "../../src/wire";
import { addGoodSkill, addSkill, cleanup, newProject, write } from "../fixtures/project";

afterEach(cleanup);

const wired = (root: string) => {
  wire(resolveLayout({ cwd: root }));
  return resolveLayout({ cwd: root });
};
const skill = (report: ReturnType<typeof check>, name: string) => report.skills.find((s) => s.name === name)!;

describe("check — C6 and C7, the old check-skill-deps.sh", () => {
  it("is clean after wiring", () => {
    const root = newProject();
    addSkill(root, "alpha");
    addSkill(root, "beta", "- `alpha` — Step 1");
    const r = check(wired(root));
    expect(r.skills.every((s) => s.checks.C6.status === "pass" && s.checks.C7.status === "pass")).toBe(true);
  });

  it("fails a declared dependency that does not exist", () => {
    const root = newProject();
    addSkill(root, "gamma", "- `missing-one` — Step 2");
    const r = check(wired(root), { names: ["gamma"] });
    expect(skill(r, "gamma").checks.C7.reasons).toContain("declared 'missing-one' does not exist");
    expect(r.ok).toBe(false);
  });

  it("fails an unwired skill on C6", () => {
    const root = newProject();
    addSkill(root, "gamma");
    const r = check(resolveLayout({ cwd: root }));
    expect(skill(r, "gamma").checks.C6.reasons).toEqual([".claude/skills: no symlink"]);
  });

  it("fails a dependency that exists but is not wired", () => {
    const root = newProject();
    addSkill(root, "alpha");
    addSkill(root, "beta", "- `alpha` — Step 1");
    const r = check(resolveLayout({ cwd: root }), { names: ["beta"] });
    expect(skill(r, "beta").checks.C7.reasons).toContain("dependency 'alpha' not wired (.claude/skills: no symlink)");
  });

  it("fails a skill with no dependency section", () => {
    const root = newProject();
    write(root, "skills/delta/SKILL.md", "---\nname: delta\n---\n\n# delta\n\nUses alpha.\n");
    const r = check(wired(root), { names: ["delta"] });
    expect(skill(r, "delta").checks.C7.reasons).toEqual(["no '## Skill dependencies' section"]);
  });

  it("fails a section with neither a skill bullet nor - none", () => {
    const root = newProject();
    addSkill(root, "delta", "nothing here");
    const r = check(wired(root));
    expect(skill(r, "delta").checks.C7.reasons[0]).toMatch(/no '- `skill`' bullet and no '- none'/);
  });

  it("fails a skill that declares itself", () => {
    const root = newProject();
    addSkill(root, "loop", "- `loop` — Step 1");
    expect(skill(check(wired(root)), "loop").checks.C7.reasons).toContain("declares itself");
  });

  it("notes, but does not fail, a skill that is named and not declared", () => {
    const root = newProject();
    addSkill(root, "alpha");
    write(root, "skills/delta/SKILL.md", "---\nname: delta\n---\n\nRun alpha first.\n\n## Skill dependencies\n\n- none\n");
    const r = check(wired(root), { names: ["delta"] });
    expect(skill(r, "delta").notes).toEqual(["mentions 'alpha' but does not declare it"]);
    expect(skill(r, "delta").checks.C7.status).toBe("pass");
  });

  it("gives a vendored skill C6 only", () => {
    const root = newProject();
    write(root, "skills/delta/SKILL.md", "---\nname: delta\n---\n");
    const r = check(wired(root), { vendored: ["delta"] });
    const d = skill(r, "delta");
    expect(d.checks.C6.status).toBe("pass");
    expect(d.checks.C7.status).toBe("skipped");
    expect(r.ok).toBe(true);
  });

  it("reports a name that is not a skill as missing", () => {
    const root = newProject();
    addSkill(root, "alpha");
    const r = check(wired(root), { names: ["nope"] });
    expect(r.missing).toEqual(["nope"]);
    expect(r.ok).toBe(false);
  });

  it("finds a dead link and a wrong target", () => {
    const root = newProject();
    addSkill(root, "alpha");
    addSkill(root, "beta");
    mkdirSync(join(root, ".claude/skills"), { recursive: true });
    symlinkSync("../../skills/nowhere", join(root, ".claude/skills/alpha"));
    symlinkSync("../../skills/alpha", join(root, ".claude/skills/beta"));
    const r = check(resolveLayout({ cwd: root }));
    expect(skill(r, "alpha").checks.C6.reasons[0]).toMatch(/dead symlink/);
    expect(skill(r, "beta").checks.C6.reasons[0]).toMatch(/wrong target/);
  });

  it("skips C6 when skills live straight in the harness folder", () => {
    const root = newProject();
    addSkill(root, "alpha", "- none", ".claude/skills");
    const r = check(resolveLayout({ cwd: root }));
    expect(r.checkedWiring).toBe(false);
    expect(r.readFrom).toBe(".claude/skills");
    expect(skill(r, "alpha").checks.C6.status).toBe("skipped");
  });

  it("runs on a package tool's install: real folder in .agents, link in .claude", () => {
    const root = newProject();
    addSkill(root, "easysk", "- none", ".agents/skills");
    mkdirSync(join(root, ".claude/skills"), { recursive: true });
    symlinkSync("../../.agents/skills/easysk", join(root, ".claude/skills/easysk"));
    const r = check(resolveLayout({ cwd: root }));
    expect(r.readFrom).toBe(".claude/skills");
    expect(skill(r, "easysk").checks.C7.status).toBe("pass");
  });
});

describe("check — C1 to C5", () => {
  it("passes a well-formed skill on every mechanical check", () => {
    const root = newProject();
    addGoodSkill(root, "good");
    const s = skill(check(wired(root)), "good");
    for (const id of ["C1", "C2", "C3", "C4", "C6", "C7"] as const) expect([id, s.checks[id]]).toEqual([id, { status: "pass", reasons: [] }]);
    expect(s.checks.C5.status).toBe("manual");
    expect(s.checks.C8.status).toBe("manual");
  });

  it("C1: names each missing or empty part", () => {
    const root = newProject();
    addSkill(root, "bare");
    mkdirSync(join(root, "skills/bare/references"));
    write(root, "skills/bare/.gitignore", "node_modules/\n");
    expect(skill(check(wired(root)), "bare").checks.C1.reasons).toEqual([
      "references/ is empty",
      "no best-practice/",
      ".gitignore does not ignore data/",
    ]);
  });

  it("C2: wrong name, long description, no trigger, no argument hint", () => {
    const long = Array.from({ length: 81 }, () => "word").join(" ");
    expect(checkFrontMatter("deploy", `---\nname: deploy-app\ndescription: ${long}\n---\n`).reasons).toEqual([
      'name is "deploy-app", folder is "deploy"',
      "description is 81 words, max 80",
      'description has no "/deploy" trigger',
      "no argument-hint",
    ]);
    expect(checkFrontMatter("x", "# no front matter").reasons).toEqual(["no front matter"]);
  });

  it("C3: missing table, steps and trace fragments, and the line budget", () => {
    const root = newProject();
    write(root, "skills/long/SKILL.md", "---\nname: long\n---\n" + "line\n".repeat(500));
    expect(skill(check(wired(root)), "long").checks.C3.reasons).toEqual([
      "SKILL.md is 503 lines, max 499",
      'no "## How to call it" table',
      'no numbered "Step N" headings',
      "no json trace fragment",
    ]);
  });

  it("C3: 499 lines is under the budget, 500 is not", () => {
    const body = (n: number) => "## How to call it\n## Step 0\n```json\n" + "x\n".repeat(n - 3);
    expect(countLines(body(499))).toBe(499);
    expect(checkShape("/nowhere", body(499)).status).toBe("pass");
    expect(checkShape("/nowhere", body(500)).reasons).toEqual(["SKILL.md is 500 lines, max 499"]);
  });

  it("counts lines like wc -l", () => {
    expect([countLines(""), countLines("a"), countLines("a\n"), countLines("a\nb"), countLines("a\r\nb\r\n")]).toEqual([0, 1, 1, 2, 2]);
  });

  it("C3: a long reference file needs a table of contents", () => {
    const root = newProject();
    addGoodSkill(root, "good");
    write(root, "skills/good/references/big.md", "# big\n" + "x\n".repeat(301));
    expect(skill(check(wired(root)), "good").checks.C3.reasons).toEqual([
      "references/big.md is 302 lines with no table of contents",
    ]);
    write(root, "skills/good/references/big.md", "# big\n\n## Contents\n" + "x\n".repeat(301));
    expect(skill(check(wired(root)), "good").checks.C3.status).toBe("pass");
  });

  it("C4: the trace rule and the _meta envelope", () => {
    const root = newProject();
    addSkill(root, "quiet");
    expect(skill(check(wired(root)), "quiet").checks.C4.reasons).toEqual([
      "no data/runs/ trace rule",
      "no _meta envelope named",
    ]);
  });

  it("C5: lists the library's files for a reader to judge", () => {
    const root = newProject();
    addGoodSkill(root, "good");
    write(root, "skills/good/best-practice/seed.md", "placeholder\n");
    expect(skill(check(wired(root)), "good").checks.C5.reasons[0]).toMatch(/example-run-trace\.json, seed\.md/);
  });
});

describe("compactReport", () => {
  it("drops passing checks and says C8 once", () => {
    const root = newProject();
    addGoodSkill(root, "good");
    addSkill(root, "bare");
    const c = compactReport(check(wired(root))) as { C8: string; skills: Record<string, unknown>[] };
    expect(typeof c.C8).toBe("string");
    const good = c.skills.find((s) => s.name === "good")!;
    expect(Object.keys(good).sort()).toEqual(["manual", "name"]);
    expect(Object.keys(good.manual as object)).toEqual(["C5"]);
    const bare = c.skills.find((s) => s.name === "bare")!;
    expect(Object.keys(bare.fail as object)).toEqual(["C1", "C2", "C3", "C4", "C5"]);
  });
});

describe("dependencySection", () => {
  it("reads up to the next ## heading", () => {
    expect(dependencySection("# x\n\n## Skill dependencies\n\n- `a`\n\n## Next\n- `b`\n")).toBe("\n- `a`\n");
    expect(dependencySection("# x\n")).toBeNull();
  });

  it("ignores trailing spaces on the heading", () => {
    expect(dependencySection("## Skill dependencies   \n- none\n")).toBe("- none\n");
  });
});
