/**
 * Where skills live in a project.
 *
 * A project keeps its own skills in one committed source folder (`skills/` by
 * default) and links each one into every harness folder an agent reads
 * (`.claude/skills/`, `.agents/skills/`, ...). A project with no source folder
 * keeps its skills straight in the first harness folder.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export interface Layout {
  /** Absolute path of the project root. */
  root: string;
  /** The source folder, relative to the root (default `skills`). */
  skillsDir: string;
  /** Harness folders, relative to the root. */
  harnessDirs: string[];
  /** False when the source folder does not exist: skills live in a harness folder. */
  hasSource: boolean;
}

export interface LayoutOptions {
  /** Where to start looking for the project root (default: the current folder). */
  cwd?: string;
  /** Source folder (default: `$SKILLS_DIR`, else `skills`). */
  skillsDir?: string;
  /** Harness folders (default: `$HARNESS_DIRS`, else `.claude/skills` plus `.agents/skills` when it exists). */
  harnessDirs?: string[];
  /** Environment to read the defaults from (default: `process.env`). */
  env?: NodeJS.ProcessEnv;
}

const trimSlash = (p: string): string => p.replace(/[\\/]+$/, "");

/** The git top level of `cwd`, or `cwd` itself outside a git repo. */
export function findRoot(cwd: string = process.cwd()): string {
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return resolve(out.trim());
  } catch {
    return resolve(cwd);
  }
}

/** Work out the project's skill folders from options, then the environment, then defaults. */
export function resolveLayout(options: LayoutOptions = {}): Layout {
  const env = options.env ?? process.env;
  const root = findRoot(options.cwd);
  const skillsDir = trimSlash(options.skillsDir ?? (env.SKILLS_DIR || "skills"));

  let harnessDirs: string[];
  if (options.harnessDirs?.length) {
    harnessDirs = options.harnessDirs.map(trimSlash);
  } else if (env.HARNESS_DIRS) {
    harnessDirs = env.HARNESS_DIRS.split(/\s+/).filter(Boolean).map(trimSlash);
  } else {
    harnessDirs = [".claude/skills"];
    if (isDir(join(root, ".agents/skills"))) harnessDirs.push(".agents/skills");
  }

  return { root, skillsDir, harnessDirs, hasSource: isDir(join(root, skillsDir)) };
}

/** The folder skills are read from: the source folder, or the first harness folder without one. */
export function readDir(layout: Layout): string {
  return layout.hasSource ? layout.skillsDir : layout.harnessDirs[0]!;
}

/** Names of the folders under `dir` that hold a SKILL.md, A–Z. */
export function listSkills(root: string, dir: string): string[] {
  const abs = join(root, dir);
  if (!isDir(abs)) return [];
  return readdirSync(abs)
    .filter((name) => existsSync(join(abs, name, "SKILL.md")))
    .sort();
}

export function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
