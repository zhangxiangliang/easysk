import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findPython, findSkillCreator, triggerEval } from "../../src/trigger-eval";
import { addSkill, cleanup, newProject, write } from "../fixtures/project";

// No model calls here: skill-creator and the claude CLI are faked.
const scratch = mkdtempSync(join(tmpdir(), "easysk-eval-test-"));
const emptyHome = join(scratch, "home");
const fakeCreator = join(scratch, "fake/skill-creator");
const fakeBin = join(scratch, "bin");
mkdirSync(emptyHome, { recursive: true });
mkdirSync(join(fakeCreator, "scripts"), { recursive: true });
writeFileSync(join(fakeCreator, "scripts/run_eval.py"), "");
mkdirSync(fakeBin, { recursive: true });

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
  cleanup();
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Put a fake `claude` first on PATH that prints `json`. */
function fakeClaude(json: string): void {
  const file = join(fakeBin, "claude");
  writeFileSync(file, `#!/bin/sh\necho '${json}'\n`);
  chmodSync(file, 0o755);
  process.env.PATH = `${fakeBin}:${savedEnv.PATH}`;
}

const project = (): string => {
  const root = newProject();
  addSkill(root, "alpha");
  write(root, "evals.json", '[{"query": "x", "should_trigger": true}]\n');
  return root;
};

/** A fake skill-creator whose scripts print what the real ones print. */
const workingCreator = join(scratch, "working/skill-creator");
mkdirSync(join(workingCreator, "scripts"), { recursive: true });
writeFileSync(
  join(workingCreator, "scripts/run_eval.py"),
  `import json, sys
assert "--num-workers" in sys.argv and sys.argv[sys.argv.index("--num-workers") + 1] == "1", "must run one query at a time"
print(json.dumps({"summary": {"passed": 1, "total": 2, "failed": 1}, "results": [
  {"query": "good", "should_trigger": True, "triggers": 3, "runs": 3, "pass": True},
  {"query": "bad", "should_trigger": True, "triggers": 0, "runs": 3, "pass": False}]}))
`
);
writeFileSync(
  join(workingCreator, "scripts/run_loop.py"),
  `import json
print(json.dumps({"original_description": "old", "best_description": "new", "best_score": "9/10", "best_test_score": 0.9, "iterations_run": 2}))
`
);

describe("findSkillCreator", () => {
  it("says not found when nothing is installed", () => {
    const r = findSkillCreator(project(), { HOME: emptyHome });
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("skill-creator not found") });
  });

  it("is turned off by SKILL_CREATOR_DIR=none", () => {
    expect(findSkillCreator(project(), { SKILL_CREATOR_DIR: "none" })).toEqual({
      ok: false,
      reason: expect.stringContaining("turned off"),
    });
  });

  it("uses SKILL_CREATOR_DIR when it holds the scripts", () => {
    const r = findSkillCreator(project(), { HOME: emptyHome, SKILL_CREATOR_DIR: fakeCreator });
    expect(r.ok && r.env.dir).toBe(fakeCreator);
  });

  it("finds a project install, and a Python 3.10+", () => {
    const root = project();
    write(root, ".claude/skills/skill-creator/scripts/run_eval.py", "");
    const r = findSkillCreator(root, { HOME: emptyHome });
    expect(r.ok && r.env.dir).toMatch(/\.claude\/skills\/skill-creator$/);
    expect(r.ok && r.env.python).toBe(findPython());
  });
});

describe("triggerEval guards", () => {
  it("cannot run without skill-creator", () => {
    const root = project();
    process.env.HOME = emptyHome;
    delete process.env.SKILL_CREATOR_DIR;
    expect(triggerEval({ cwd: root, skill: "skills/alpha", evalSet: "evals.json" })).toMatchObject({
      status: "error",
      exitCode: 2,
    });
  });

  it("needs a model to optimize", () => {
    expect(triggerEval({ cwd: project(), skill: "skills/alpha", evalSet: "evals.json", optimize: 1 })).toMatchObject({
      exitCode: 2,
      reason: expect.stringContaining("needs a model"),
    });
  });

  it("needs the skill and the eval set to exist", () => {
    const root = project();
    expect(triggerEval({ cwd: root, skill: "skills/nope", evalSet: "evals.json" })).toMatchObject({ exitCode: 2 });
    expect(triggerEval({ cwd: root, skill: "skills/alpha", evalSet: "nope.json" })).toMatchObject({ exitCode: 2 });
  });

  it("writes no score when claude -p is logged out", () => {
    const root = project();
    process.env.SKILL_CREATOR_DIR = fakeCreator;
    fakeClaude('{"is_error": true, "result": ""}');
    const r = triggerEval({ cwd: root, skill: "skills/alpha", evalSet: "evals.json" });
    expect(r).toMatchObject({ exitCode: 2, reason: expect.stringContaining("no score written") });
  });

  it("gets past the preflight when claude -p answers", () => {
    const root = project();
    process.env.SKILL_CREATOR_DIR = fakeCreator;
    fakeClaude('{"is_error": false, "result": "ok"}');
    const r = triggerEval({ cwd: root, skill: "skills/alpha", evalSet: "evals.json" });
    // the fake run_eval.py prints nothing, so it fails one step later
    expect(r).toMatchObject({ exitCode: 2, reason: expect.stringContaining("printed no result") });
  });
});

describe("triggerEval with a working skill-creator", () => {
  beforeEach(() => {
    process.env.SKILL_CREATOR_DIR = workingCreator;
    fakeClaude('{"is_error": false, "result": "ok"}');
  });

  it("reports the score and every failed query, and keeps the raw result", () => {
    const root = project();
    const r = triggerEval({ cwd: root, skill: "skills/alpha", evalSet: "evals.json", runs: 3 });
    expect(r).toMatchObject({ status: "measured", exitCode: 1, passed: 1, total: 2 });
    if (r.status !== "measured") throw new Error("not measured");
    expect(r.failures.map((f) => f.query)).toEqual(["bad"]);
    expect(r.file).toMatch(/skills\/alpha\/data\/evals\/\d{8}T\d{6}Z--trigger\.json$/);
  });

  it("proposes a description with --optimize and writes nothing to the skill", () => {
    const root = project();
    const before = readFileSync(join(root, "skills/alpha/SKILL.md"), "utf8");
    const r = triggerEval({ cwd: root, skill: "skills/alpha", evalSet: "evals.json", model: "m", optimize: 2 });
    expect(r).toMatchObject({
      status: "optimized",
      original_description: "old",
      best_description: "new",
      scores: { best_score: "9/10", best_test_score: 0.9, iterations_run: 2 },
    });
    expect(readFileSync(join(root, "skills/alpha/SKILL.md"), "utf8")).toBe(before);
  });
});
