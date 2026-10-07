/**
 * The mechanical half of an audit: every check from the list (C1–C8) that a
 * program can settle without judgment.
 *
 * C5 (are the library's artifacts real?) and C8 (the project's own rules)
 * need a reader, so they come back as `manual` with the facts a reader needs.
 * A tool that pretended to judge them would be wrong in a way nobody notices.
 */
import { existsSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { countWords, parseFrontMatter } from "./frontmatter";
import { isDir, Layout, listSkills, readDir } from "./layout";
import { holdsTarget, isLink, linkTarget } from "./wire";

export type CheckId = "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8";
export type Status = "pass" | "fail" | "manual" | "skipped";

export interface CheckResult {
  status: Status;
  /** One line per problem for `fail`; what to look at for `manual`. */
  reasons: string[];
}

export interface SkillReport {
  name: string;
  vendored: boolean;
  checks: Record<CheckId, CheckResult>;
  /** Things to look at, never failures: skills the file names but does not declare. */
  notes: string[];
}

export interface CheckReport {
  /** The folder skills were read from. */
  readFrom: string;
  /** False when C6 was skipped because the project has no source folder. */
  checkedWiring: boolean;
  harnessDirs: string[];
  skills: SkillReport[];
  /** Names that were asked for but are not skills. */
  missing: string[];
  summary: { checked: number; failing: number; notes: number };
  /** True when no check failed and nothing asked for was missing. */
  ok: boolean;
}

export interface CheckOptions {
  /** Only these skills (default: all). */
  names?: string[];
  /** Skills copied from elsewhere. They keep their upstream shape, so they get C6 only. */
  vendored?: string[];
}

export const MAX_DESCRIPTION_WORDS = 80;
export const MAX_SKILL_LINES = 500;
export const REFERENCE_TOC_LINES = 300;
export const DEPS_HEADING = "## Skill dependencies";
export const C8_REASON = "read the project's CLAUDE.md / AGENTS.md and check its rules for skills";

const verdict = (reasons: string[]): CheckResult => ({ status: reasons.length ? "fail" : "pass", reasons });

export function check(layout: Layout, options: CheckOptions = {}): CheckReport {
  const dir = readDir(layout);
  const all = listSkills(layout.root, dir);
  const wanted = options.names?.length ? options.names : all;
  const vendored = new Set(options.vendored ?? []);

  const missing = wanted.filter((name) => !all.includes(name));
  const skills = wanted
    .filter((name) => all.includes(name))
    .map((name) => checkSkill(layout, dir, all, name, vendored.has(name)));

  const failing = skills.filter((s) => Object.values(s.checks).some((c) => c.status === "fail")).length;
  const notes = skills.reduce((n, s) => n + s.notes.length, 0);

  return {
    readFrom: dir,
    checkedWiring: layout.hasSource,
    harnessDirs: layout.harnessDirs,
    skills,
    missing,
    summary: { checked: skills.length, failing, notes },
    ok: failing === 0 && missing.length === 0,
  };
}

function checkSkill(layout: Layout, dir: string, all: string[], name: string, vendored: boolean): SkillReport {
  const folder = join(layout.root, dir, name);
  const text = readFileSync(join(folder, "SKILL.md"), "utf8");
  const skipped: CheckResult = { status: "skipped", reasons: ["vendored: keeps its upstream shape"] };

  const c6 = checkWired(layout, name);
  if (vendored) {
    return {
      name,
      vendored,
      notes: [],
      checks: { C1: skipped, C2: skipped, C3: skipped, C4: skipped, C5: skipped, C6: c6, C7: skipped, C8: skipped },
    };
  }

  const deps = checkDependencies(layout, all, name, text);
  return {
    name,
    vendored,
    notes: deps.notes,
    checks: {
      C1: checkFolder(folder),
      C2: checkFrontMatter(name, text),
      C3: checkShape(folder, text),
      C4: checkRunTrace(text),
      C5: checkLibrary(folder),
      C6: c6,
      C7: deps.result,
      C8: { status: "manual", reasons: [C8_REASON] },
    },
  };
}

/** C1 — the folder and its committed parts. */
export function checkFolder(folder: string): CheckResult {
  const reasons: string[] = [];
  for (const sub of ["references", "best-practice"]) {
    if (!isDir(join(folder, sub))) reasons.push(`no ${sub}/`);
    else if (readdirSync(join(folder, sub)).length === 0) reasons.push(`${sub}/ is empty`);
  }
  const ignore = join(folder, ".gitignore");
  if (!existsSync(ignore)) reasons.push("no .gitignore");
  else if (!/^\/?data\/?\s*$/m.test(readFileSync(ignore, "utf8"))) reasons.push(".gitignore does not ignore data/");
  return verdict(reasons);
}

/** C2 — name, description and argument hint. Whether the description is "pushy" is left to a reader. */
export function checkFrontMatter(name: string, text: string): CheckResult {
  const fm = parseFrontMatter(text);
  if (!fm.present) return verdict(["no front matter"]);

  const reasons: string[] = [];
  const { fields } = fm;
  if (fields.name !== name) reasons.push(`name is ${fields.name ? `"${fields.name}"` : "missing"}, folder is "${name}"`);

  const description = fields.description;
  if (!description) {
    reasons.push("no description");
  } else {
    const words = countWords(description);
    if (words > MAX_DESCRIPTION_WORDS) reasons.push(`description is ${words} words, max ${MAX_DESCRIPTION_WORDS}`);
    if (!description.includes(`/${name}`)) reasons.push(`description has no "/${name}" trigger`);
  }
  if (!fields["argument-hint"]) reasons.push("no argument-hint");
  return verdict(reasons);
}

/** C3 — overview, command table, steps with trace fragments, line budget. */
export function checkShape(folder: string, text: string): CheckResult {
  const reasons: string[] = [];
  const lines = countLines(text);
  if (lines >= MAX_SKILL_LINES) reasons.push(`SKILL.md is ${lines} lines, max ${MAX_SKILL_LINES - 1}`);
  if (!/^## How to call it\s*$/m.test(text)) reasons.push('no "## How to call it" table');
  if (!/^#{2,3} Step \d/m.test(text)) reasons.push('no numbered "Step N" headings');
  if (!/^```json\s*$/m.test(text)) reasons.push("no json trace fragment");

  const refs = join(folder, "references");
  if (isDir(refs)) {
    for (const file of readdirSync(refs).filter((f) => f.endsWith(".md"))) {
      const body = readFileSync(join(refs, file), "utf8");
      const n = countLines(body);
      if (n > REFERENCE_TOC_LINES && !/^#{2,3} (Contents|Table of contents)\s*$/im.test(body)) {
        reasons.push(`references/${file} is ${n} lines with no table of contents`);
      }
    }
  }
  return verdict(reasons);
}

/** C4 — the run trace rule is stated. */
export function checkRunTrace(text: string): CheckResult {
  const reasons: string[] = [];
  if (!text.includes("data/runs/")) reasons.push("no data/runs/ trace rule");
  if (!text.includes("_meta")) reasons.push("no _meta envelope named");
  return verdict(reasons);
}

/** C5 — whether the library holds REAL artifacts needs a reader; this lists what is there. */
export function checkLibrary(folder: string): CheckResult {
  const dir = join(folder, "best-practice");
  if (!isDir(dir)) return verdict(["no best-practice/"]);
  const files = readdirSync(dir).filter((f) => !f.startsWith("."));
  if (files.length === 0) return verdict(["best-practice/ is empty"]);
  return { status: "manual", reasons: [`confirm these are real artifacts, not placeholders: ${files.join(", ")}`] };
}

/** C6 — a link that resolves to the skill, in every harness folder. Skipped without a source folder. */
export function checkWired(layout: Layout, name: string): CheckResult {
  if (!layout.hasSource) return { status: "skipped", reasons: ["no source folder: skills live in the harness folder"] };
  const reasons: string[] = [];
  for (const dir of layout.harnessDirs) {
    const link = join(layout.root, dir, name);
    const target = linkTarget(layout.root, dir, join(layout.skillsDir, name));
    if (!isLink(link)) reasons.push(`${dir}: no symlink`);
    else if (!existsSync(link)) reasons.push(`${dir}: dead symlink -> ${readlinkSync(link)}`);
    else if (!holdsTarget(link, target)) reasons.push(`${dir}: wrong target ${readlinkSync(link)}`);
  }
  return verdict(reasons);
}

/** The body of the `## Skill dependencies` section, or null when there is none. */
export function dependencySection(text: string): string | null {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.replace(/\s+$/, "") === DEPS_HEADING);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/** C7 — every skill this one calls is declared, exists, and is wired. */
export function checkDependencies(
  layout: Layout,
  all: string[],
  name: string,
  text: string
): { result: CheckResult; notes: string[] } {
  const reasons: string[] = [];
  const notes: string[] = [];
  const section = dependencySection(text);

  let declared: string[] = [];
  if (section === null) {
    reasons.push(`no '${DEPS_HEADING}' section`);
  } else {
    declared = [...section.matchAll(/^- `([a-z0-9-]+)`/gm)].map((m) => m[1]!);
    if (declared.length === 0 && !/^- none\s*$/m.test(section)) {
      reasons.push("section has no '- `skill`' bullet and no '- none'");
    }
    for (const dep of declared) {
      if (dep === name) reasons.push("declares itself");
      else if (!all.includes(dep)) reasons.push(`declared '${dep}' does not exist`);
      else {
        const wired = checkWired(layout, dep);
        for (const r of wired.status === "fail" ? wired.reasons : []) reasons.push(`dependency '${dep}' not wired (${r})`);
      }
    }
  }

  // other skills the file names outside the section, but does not declare
  const rest = section === null ? text : text.replace(section, "");
  for (const other of all) {
    if (other === name || declared.includes(other)) continue;
    const named = new RegExp(`(^|[^a-z0-9-])${escape(other)}([^a-z0-9-]|$)`, "m");
    if (named.test(rest)) notes.push(`mentions '${other}' but does not declare it`);
  }

  return { result: verdict(reasons), notes };
}

/** Lines the way `wc -l` and an editor count them: a final newline does not start a new line. */
export const countLines = (text: string): number =>
  text === "" ? 0 : text.split(/\r?\n/).length - (/\r?\n$/.test(text) ? 1 : 0);

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * What the CLI prints by default: only what needs acting on. A passing check
 * is one word of output times eight checks times every skill — and this is
 * mostly read by an AI paying for every token. `--details` prints it all.
 */
export function compactReport(report: CheckReport): Record<string, unknown> {
  return {
    ok: report.ok,
    summary: report.summary,
    readFrom: report.readFrom,
    checkedWiring: report.checkedWiring,
    ...(report.missing.length ? { missing: report.missing } : {}),
    // C8 is the same question for every skill: say it once, not once per skill
    ...(report.skills.some((s) => s.checks.C8.status === "manual") ? { C8: C8_REASON } : {}),
    skills: report.skills.map((s) => {
      const pick = (status: Status): Partial<Record<CheckId, string[]>> =>
        Object.fromEntries(
          Object.entries(s.checks)
            .filter(([id, c]) => c.status === status && id !== "C8")
            .map(([id, c]) => [id, c.reasons])
        );
      const fail = pick("fail");
      const manual = pick("manual");
      return {
        name: s.name,
        ...(s.vendored ? { vendored: true } : {}),
        ...(Object.keys(fail).length ? { fail } : {}),
        ...(Object.keys(manual).length ? { manual } : {}),
        ...(s.notes.length ? { notes: s.notes } : {}),
      };
    }),
  };
}
