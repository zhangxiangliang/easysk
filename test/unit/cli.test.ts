import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { parseArgs, run as runInProcess } from "../../src/cli";
import { addSkill, cleanup, newProject } from "../fixtures/project";

afterEach(cleanup);

// The built CLI, the same code a user runs with npx.
const cli = join(__dirname, "../../dist/cli.js");
const run = (cwd: string, ...args: string[]) =>
  spawnSync(process.execPath, [cli, ...args], { cwd, encoding: "utf8", env: { ...process.env, HARNESS_DIRS: "", SKILLS_DIR: "" } });

describe("parseArgs", () => {
  it("reads the command, names and flags", () => {
    expect(parseArgs(["check", "a", "b", "--vendored", "x, y", "--details"])).toMatchObject({
      command: "check",
      positional: ["a", "b"],
      vendored: ["x", "y"],
      details: true,
    });
  });

  it("reads eval options, and drops a run count that is not a whole number", () => {
    expect(parseArgs(["eval", "s", "e.json", "--runs", "3", "--model", "m", "--optimize", "two"])).toMatchObject({
      command: "eval",
      positional: ["s", "e.json"],
      runs: 3,
      model: "m",
      optimize: undefined,
    });
  });

  it("reads layout options", () => {
    expect(parseArgs(["wire", "--dry-run", "--skills-dir", "s/", "--harness", ".a/skills,.b/skills"])).toMatchObject({
      dryRun: true,
      skillsDir: "s/",
      harnessDirs: [".a/skills", ".b/skills"],
    });
  });
});

describe("the built CLI", () => {
  beforeAll(() => {
    execFileSync("npm", ["run", "build", "--silent"], { cwd: join(__dirname, "../.."), stdio: "ignore" });
  });

  it("wires, then checks clean on C6 and C7, as JSON", () => {
    const root = newProject();
    addSkill(root, "alpha");
    const w = run(root, "wire");
    expect(w.status).toBe(0);
    expect(JSON.parse(w.stdout).created).toBe(1);

    const c = run(root, "check");
    const report = JSON.parse(c.stdout);
    expect(report.skills[0].fail.C6).toBeUndefined();
    expect(report.skills[0].fail.C7).toBeUndefined();
    expect(c.status).toBe(1); // a bare skill fails C1–C4
  });

  it("exits 1 when wire finds a stale copy", () => {
    const root = newProject();
    addSkill(root, "alpha");
    addSkill(root, "alpha", "- none", ".claude/skills");
    expect(run(root, "wire").status).toBe(1);
  });

  it("prints help, a version, and refuses an unknown command", () => {
    const root = newProject();
    expect(run(root, "--help").stdout).toContain("easysk check");
    expect(run(root, "--version").stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    const bad = run(root, "frobnicate");
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain('unknown command "frobnicate"');
  });

  it("asks for both eval arguments", () => {
    expect(run(newProject(), "eval", "skills/x").status).toBe(2);
  });
});

describe("run, in process", () => {
  const out: string[] = [];
  let cwd: string;
  beforeEach(() => {
    out.length = 0;
    cwd = process.cwd();
    jest.spyOn(process.stdout, "write").mockImplementation((chunk) => (out.push(String(chunk)), true));
    jest.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    process.chdir(cwd);
    jest.restoreAllMocks();
  });

  it("checks with --details, vendored from the environment", () => {
    const root = newProject();
    addSkill(root, "alpha");
    process.chdir(root);
    process.env.VENDORED_SKILLS = "alpha";
    try {
      expect(runInProcess(parseArgs(["check", "--details"]))).toBe(1); // unwired: C6 fails even for vendored
      const report = JSON.parse(out.join(""));
      expect(report.skills[0].vendored).toBe(true);
      expect(report.skills[0].checks.C7.status).toBe("skipped");
    } finally {
      delete process.env.VENDORED_SKILLS;
    }
  });

  it("wires with --dry-run", () => {
    const root = newProject();
    addSkill(root, "alpha");
    process.chdir(root);
    expect(runInProcess(parseArgs(["wire", "--dry-run"]))).toBe(0);
    expect(JSON.parse(out.join("")).dryRun).toBe(true);
  });

  it("prints help with no command, and exits 2", () => {
    expect(runInProcess(parseArgs([]))).toBe(2);
    expect(out.join("")).toContain("Usage:");
  });

  it("passes eval options through and returns its exit code", () => {
    const root = newProject();
    process.chdir(root);
    expect(runInProcess(parseArgs(["eval", "skills/none", "e.json"]))).toBe(2);
    expect(JSON.parse(out.join("")).reason).toMatch(/no skills\/none\/SKILL.md/);
  });
});
