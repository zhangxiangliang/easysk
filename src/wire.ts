/**
 * Link every skill in the source folder into every harness folder (check C6).
 *
 * It only ever creates or removes links. A real directory in a harness folder
 * (a stale copy, or a package tool's install) is reported and left alone: a
 * person checks it before it goes. Copy-based sync is never used — copies go
 * stale and overwrite the links.
 */
import { lstatSync, mkdirSync, readdirSync, readlinkSync, symlinkSync, unlinkSync, existsSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { Layout, listSkills } from "./layout";

export type WireAction =
  | { kind: "mkdir"; path: string }
  | { kind: "create"; link: string; target: string }
  | { kind: "replace"; link: string; target: string; was: string }
  | { kind: "remove"; link: string; was: string }
  | { kind: "stale"; link: string };

export interface WireResult {
  /** False when nothing was wired because the project has no source folder. */
  hasSource: boolean;
  dryRun: boolean;
  created: number;
  replaced: number;
  removed: number;
  kept: number;
  /** Real directories found where a link should be. Non-zero means "look at these". */
  stale: number;
  actions: WireAction[];
  harnessDirs: string[];
}

const isWindows = process.platform === "win32";

/** What a link to `skillPath` should hold: relative on macOS/Linux, absolute for a Windows junction. */
export function linkTarget(root: string, harnessDir: string, skillPath: string): string {
  const abs = resolve(root, skillPath);
  return isWindows ? abs : relative(resolve(root, harnessDir), abs);
}

/** True when the link at `link` already holds `target` (or, on Windows, resolves to it). */
export function holdsTarget(link: string, target: string): boolean {
  const current = readlinkSync(link);
  if (!isWindows) return current === target;
  return resolve(dirname(link), current.replace(/^\\\\\?\\/, "")) === resolve(target);
}

export function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

export function wire(layout: Layout, options: { dryRun?: boolean } = {}): WireResult {
  const dryRun = options.dryRun ?? false;
  const result: WireResult = {
    hasSource: layout.hasSource,
    dryRun,
    created: 0,
    replaced: 0,
    removed: 0,
    kept: 0,
    stale: 0,
    actions: [],
    harnessDirs: layout.harnessDirs,
  };
  if (!layout.hasSource) return result; // skills live in the harness folder: nothing to link

  const { root } = layout;
  const skills = listSkills(root, layout.skillsDir);

  for (const dir of layout.harnessDirs) {
    const absDir = join(root, dir);
    if (!existsSync(absDir)) {
      result.actions.push({ kind: "mkdir", path: dir });
      if (!dryRun) mkdirSync(absDir, { recursive: true });
    }

    // 1. every skill with a SKILL.md gets a link
    for (const name of skills) {
      const link = posix.join(dir, name);
      const absLink = join(root, dir, name);
      const target = linkTarget(root, dir, join(layout.skillsDir, name));

      if (isLink(absLink)) {
        if (holdsTarget(absLink, target)) {
          result.kept += 1;
          continue;
        }
        const was = readlinkSync(absLink);
        result.actions.push({ kind: "replace", link, target, was });
        result.replaced += 1;
        if (!dryRun) {
          unlinkSync(absLink);
          makeLink(target, absLink);
        }
      } else if (existsSync(absLink)) {
        result.actions.push({ kind: "stale", link });
        result.stale += 1;
      } else {
        result.actions.push({ kind: "create", link, target });
        result.created += 1;
        if (!dryRun) makeLink(target, absLink);
      }
    }

    // 2. dead links (renamed or merged skills) go away
    if (!existsSync(absDir)) continue;
    for (const name of readdirSync(absDir)) {
      const absLink = join(absDir, name);
      if (!isLink(absLink) || existsSync(absLink)) continue;
      const was = readlinkSync(absLink);
      result.actions.push({ kind: "remove", link: posix.join(dir, name), was });
      result.removed += 1;
      if (!dryRun) unlinkSync(absLink);
    }
  }

  return result;
}

function makeLink(target: string, link: string): void {
  // A junction needs no admin rights on Windows; elsewhere a plain directory symlink.
  symlinkSync(target, link, isWindows ? "junction" : "dir");
}
