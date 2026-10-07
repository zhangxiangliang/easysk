import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { resolveLayout } from "../../src/layout";
import { wire } from "../../src/wire";
import { addSkill, cleanup, newProject } from "../fixtures/project";

afterEach(cleanup);

const isLink = (p: string): boolean => {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};

describe("wire", () => {
  it("links every skill into .claude/skills and the link resolves", () => {
    const root = newProject();
    addSkill(root, "alpha");
    addSkill(root, "beta", "- `alpha` — Step 1");

    const r = wire(resolveLayout({ cwd: root }));

    expect(r.created).toBe(2);
    expect(isLink(join(root, ".claude/skills/alpha"))).toBe(true);
    expect(readFileSync(join(root, ".claude/skills/beta/SKILL.md"), "utf8")).toContain("name: beta");
  });

  it("does not make an .agents folder when there is none", () => {
    const root = newProject();
    addSkill(root, "alpha");
    wire(resolveLayout({ cwd: root }));
    expect(existsSync(join(root, ".agents"))).toBe(false);
  });

  it("is a no-op the second time", () => {
    const root = newProject();
    addSkill(root, "alpha");
    wire(resolveLayout({ cwd: root }));
    const r = wire(resolveLayout({ cwd: root }));
    expect([r.created, r.replaced, r.removed, r.kept]).toEqual([0, 0, 0, 1]);
  });

  it("replaces a link that points somewhere else", () => {
    const root = newProject();
    addSkill(root, "alpha");
    addSkill(root, "beta");
    mkdirSync(join(root, ".claude/skills"), { recursive: true });
    symlinkSync("../../skills/beta", join(root, ".claude/skills/alpha"));

    const r = wire(resolveLayout({ cwd: root }));

    expect(r.replaced).toBe(1);
    expect(readFileSync(join(root, ".claude/skills/alpha/SKILL.md"), "utf8")).toContain("name: alpha");
  });

  it("removes a dead link left by a removed skill", () => {
    const root = newProject();
    addSkill(root, "alpha");
    addSkill(root, "gone");
    wire(resolveLayout({ cwd: root }));
    rmSync(join(root, "skills/gone"), { recursive: true });

    const r = wire(resolveLayout({ cwd: root }));

    expect(r.removed).toBe(1);
    expect(isLink(join(root, ".claude/skills/gone"))).toBe(false);
  });

  it("reports a real directory as stale and leaves it alone", () => {
    const root = newProject();
    addSkill(root, "stale");
    mkdirSync(join(root, ".claude/skills/stale"), { recursive: true });

    const r = wire(resolveLayout({ cwd: root }));

    expect(r.stale).toBe(1);
    expect(r.actions).toContainEqual({ kind: "stale", link: ".claude/skills/stale" });
    expect(isLink(join(root, ".claude/skills/stale"))).toBe(false);
  });

  it("wires .agents/skills too when it exists", () => {
    const root = newProject();
    addSkill(root, "alpha");
    mkdirSync(join(root, ".agents/skills"), { recursive: true });

    wire(resolveLayout({ cwd: root }));

    expect(readFileSync(join(root, ".agents/skills/alpha/SKILL.md"), "utf8")).toContain("name: alpha");
  });

  it("touches nothing on a dry run", () => {
    const root = newProject();
    addSkill(root, "alpha");

    const r = wire(resolveLayout({ cwd: root }), { dryRun: true });

    expect(r.actions).toContainEqual({ kind: "create", link: ".claude/skills/alpha", target: "../../skills/alpha" });
    expect(existsSync(join(root, ".claude"))).toBe(false);
  });

  it("does nothing when skills live straight in the harness folder", () => {
    const root = newProject();
    addSkill(root, "alpha", "- none", ".claude/skills");

    const r = wire(resolveLayout({ cwd: root }));

    expect(r.hasSource).toBe(false);
    expect(r.actions).toEqual([]);
  });

  it("wires a project's own skills next to a package tool's install, and leaves the install alone", () => {
    // what `npx skills add` with the symlink method leaves behind
    const root = newProject();
    addSkill(root, "easysk", "- none", ".agents/skills");
    mkdirSync(join(root, ".claude/skills"), { recursive: true });
    symlinkSync("../../.agents/skills/easysk", join(root, ".claude/skills/easysk"));
    addSkill(root, "alpha");

    const r = wire(resolveLayout({ cwd: root }));

    expect(r.stale).toBe(0);
    expect(isLink(join(root, ".claude/skills/alpha"))).toBe(true);
    expect(isLink(join(root, ".agents/skills/alpha"))).toBe(true);
    expect(isLink(join(root, ".agents/skills/easysk"))).toBe(false);
    expect(isLink(join(root, ".claude/skills/easysk"))).toBe(true);
  });

  it("honours --skills-dir and --harness", () => {
    const root = newProject();
    addSkill(root, "alpha", "- none", "my-skills");

    wire(resolveLayout({ cwd: root, skillsDir: "my-skills", harnessDirs: [".cursor/skills"] }));

    expect(isLink(join(root, ".cursor/skills/alpha"))).toBe(true);
  });
});
