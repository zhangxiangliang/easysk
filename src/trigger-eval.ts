/**
 * Measure how often a skill's description triggers, with Anthropic's
 * skill-creator scripts (Python). It never edits the skill: `optimize` only
 * PROPOSES a description, and the skill's own approval gate decides.
 *
 * Three traps this exists for (all found 2026-10-07):
 * - run_eval.py adds a temporary command with the same description and counts
 *   a trigger only when THAT command is chosen. If the real skill is installed
 *   too, the model may pick it and the run reads as a miss. So the run happens
 *   in a temporary project root that links every OTHER skill of the project
 *   (they still compete, as in real use) but not this one.
 * - Parallel runs share that root's .claude/commands folder and pick each
 *   other's copies: 0/3 in parallel, 3/3 one at a time on the same queries.
 *   So it runs one query at a time.
 * - A logged-out `claude` CLI, or a model id it does not know, makes every
 *   query read as a miss, which looks like a real score. A one-line preflight
 *   turns that into "could not run".
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { findRoot } from "./layout";

export interface SkillCreatorEnv {
  /** Folder holding scripts/run_eval.py. */
  dir: string;
  /** A Python 3.10+ command. */
  python: string;
}

/** Search order for skill-creator: project skills, then the user's skills and plugins. */
export function skillCreatorRoots(root: string, home: string = homedir()): string[] {
  return [
    join(root, ".claude/skills"),
    join(root, ".agents/skills"),
    join(home, ".claude/skills"),
    join(home, ".claude/plugins"),
  ];
}

/**
 * Find skill-creator's scripts and a Python that can run them.
 * `$SKILL_CREATOR_DIR` forces one copy; `SKILL_CREATOR_DIR=none` turns it off.
 * Inside one root the newest copy wins, because synced copies pile up.
 */
export function findSkillCreator(
  root: string,
  env: NodeJS.ProcessEnv = process.env
): { ok: true; env: SkillCreatorEnv } | { ok: false; reason: string } {
  if (env.SKILL_CREATOR_DIR === "none") return { ok: false, reason: "turned off (SKILL_CREATOR_DIR=none)" };

  let dir: string | undefined;
  if (env.SKILL_CREATOR_DIR && existsSync(join(env.SKILL_CREATOR_DIR, "scripts/run_eval.py"))) {
    dir = env.SKILL_CREATOR_DIR;
  } else {
    for (const r of skillCreatorRoots(root, env.HOME || homedir())) {
      dir = newestCopy(r);
      if (dir) break;
    }
  }
  if (!dir) return { ok: false, reason: "skill-creator not found (no scripts/run_eval.py under the searched folders)" };

  const python = findPython();
  if (!python) return { ok: false, reason: "no Python 3.10+ found (skill-creator's scripts need it)" };
  return { ok: true, env: { dir, python } };
}

function newestCopy(searchRoot: string): string | undefined {
  const found: { dir: string; mtime: number }[] = [];
  const seen = new Set<string>();
  const walk = (dir: string, depth: number): void => {
    if (depth > 8) return;
    let real: string;
    try {
      real = realpathSync(dir);
    } catch {
      return;
    }
    if (seen.has(real)) return;
    seen.add(real);
    if (basename(dir) === "skill-creator" && existsSync(join(dir, "scripts/run_eval.py"))) {
      found.push({ dir, mtime: statSync(dir).mtimeMs });
      return;
    }
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e);
      try {
        if (statSync(p).isDirectory()) walk(p, depth + 1); // statSync follows links, like find -L
      } catch {
        // a dead link: skip
      }
    }
  };
  walk(searchRoot, 0);
  return found.sort((a, b) => b.mtime - a.mtime)[0]?.dir;
}

export function findPython(): string | undefined {
  const names = process.platform === "win32" ? ["python", "py"] : ["python3.13", "python3.12", "python3.11", "python3.10", "python3", "python"];
  for (const name of names) {
    const r = spawnSync(name, ["-c", "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"], { stdio: "ignore" });
    if (r.status === 0) return name;
  }
  return undefined;
}

/** The environment for a nested `claude -p`: CLAUDECODE would make it refuse to start. */
function nestedEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  delete env.CLAUDECODE;
  return env;
}

/** One tiny `claude -p` with the same model: true when it answers. */
export function claudeAnswers(model?: string): boolean {
  const args = ["-p", "Reply with the single word ok.", "--output-format", "json"];
  if (model) args.push("--model", model);
  const r = spawnSync("claude", args, { env: nestedEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  if (r.error || r.status !== 0) return false;
  try {
    const o = JSON.parse(r.stdout) as { is_error?: boolean; result?: unknown };
    return !o.is_error && String(o.result ?? "").trim() !== "";
  } catch {
    return false;
  }
}

export interface TriggerEvalOptions {
  /** The skill folder, relative to the project root or absolute. */
  skill: string;
  /** skill-creator's eval set: [{"query": "...", "should_trigger": true}, ...] */
  evalSet: string;
  runs?: number;
  model?: string;
  /** A description to test instead of the one in SKILL.md. */
  description?: string;
  /** Run skill-creator's optimizer for this many iterations and propose a description. */
  optimize?: number;
  cwd?: string;
}

export interface QueryResult {
  query: string;
  should_trigger: boolean;
  triggers: number;
  runs: number;
  pass: boolean;
}

export type TriggerEvalResult =
  | { status: "error"; exitCode: 2; reason: string }
  | { status: "measured"; exitCode: 0 | 1; passed: number; total: number; failures: QueryResult[]; file: string }
  | {
      status: "optimized";
      exitCode: 0;
      file: string;
      original_description: string;
      best_description: string;
      scores: Record<string, unknown>;
    };

const fail = (reason: string): TriggerEvalResult => ({ status: "error", exitCode: 2, reason });

export function triggerEval(options: TriggerEvalOptions): TriggerEvalResult {
  const root = findRoot(options.cwd);
  const skill = resolve(root, options.skill);
  const evalSet = resolve(root, options.evalSet);
  if (!existsSync(join(skill, "SKILL.md"))) return fail(`no ${options.skill}/SKILL.md`);
  if (!existsSync(evalSet)) return fail(`no eval set at ${options.evalSet}`);
  if (options.optimize && !options.model) return fail("optimize needs a model (the model that proposes descriptions)");

  const sc = findSkillCreator(root);
  if (!sc.ok) return fail(sc.reason);
  if (!claudeAnswers(options.model)) {
    return fail(`claude -p cannot answer here${options.model ? ` with model ${options.model}` : ""} (logged out, or an unknown model id); no score written`);
  }

  const outDir = join(skill, "data/evals");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

  const sandbox = makeSandbox(root, basename(skill));
  try {
    const args = ["--eval-set", evalSet, "--skill-path", skill, "--runs-per-query", String(options.runs ?? 3), "--num-workers", "1"];
    if (options.model) args.push("--model", options.model);
    if (options.description) args.push("--description", options.description);
    const run = (module: string, extra: string[]): string => {
      const r = spawnSync(sc.env.python, ["-m", module, ...args, ...extra], {
        cwd: sandbox,
        env: nestedEnv({ PYTHONPATH: sc.env.dir }),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"], // progress on stderr stays visible
        maxBuffer: 64 * 1024 * 1024,
      });
      return r.stdout ?? "";
    };

    if (options.optimize) {
      const resultsDir = join(outDir, `${stamp}--optimize`);
      mkdirSync(resultsDir, { recursive: true });
      const out = run("scripts.run_loop", ["--max-iterations", String(options.optimize), "--report", "none", "--results-dir", resultsDir]);
      const file = join(resultsDir, "output.json");
      writeFileSync(file, out);
      const o = parse(out);
      if (!o) return fail(`skill-creator printed no result; see ${file}`);
      const scores: Record<string, unknown> = {};
      for (const k of ["best_score", "best_train_score", "best_test_score", "iterations_run"]) if (k in o) scores[k] = o[k];
      return {
        status: "optimized",
        exitCode: 0,
        file,
        original_description: String(o.original_description ?? ""),
        best_description: String(o.best_description ?? ""),
        scores,
      };
    }

    const out = run("scripts.run_eval", []);
    const file = join(outDir, `${stamp}--trigger.json`);
    writeFileSync(file, out);
    const o = parse(out) as { summary?: { passed: number; total: number }; results?: QueryResult[] } | undefined;
    if (!o?.summary || !o.results) return fail(`skill-creator printed no result; see ${file}`);
    const { passed, total } = o.summary;
    return {
      status: "measured",
      exitCode: passed === total ? 0 : 1,
      passed,
      total,
      failures: o.results.filter((r) => !r.pass),
      file,
    };
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

/** A throwaway project root: the project's instructions and every other skill, but not this one. */
function makeSandbox(root: string, name: string): string {
  const sandbox = mkdtempSync(join(tmpdir(), "easysk-eval-"));
  mkdirSync(join(sandbox, ".claude/skills"), { recursive: true });
  for (const f of ["CLAUDE.md", "AGENTS.md"]) {
    if (existsSync(join(root, f))) symlinkSync(join(root, f), join(sandbox, f));
  }
  const skills = join(root, ".claude/skills");
  if (existsSync(skills)) {
    for (const n of readdirSync(skills)) {
      if (n === name) continue;
      try {
        symlinkSync(realpathSync(join(skills, n)), join(sandbox, ".claude/skills", n), "dir");
      } catch {
        // a dead link: leave it out
      }
    }
  }
  return sandbox;
}

function parse(text: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/** Read an eval set, so a caller can show it to the user before the first run. */
export function readEvalSet(path: string): { query: string; should_trigger: boolean }[] {
  return JSON.parse(readFileSync(path, "utf8"));
}
