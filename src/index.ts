/**
 * easysk — keep every AI agent skill in a project in one shape.
 *
 * The library is the mechanical half: find skills, link them into harness
 * folders, run the checks a program can settle, measure triggering. The
 * judgment half (designing, fixing, rebuilding a skill with the user) is in
 * skills/easysk/SKILL.md.
 */
export { findRoot, resolveLayout, readDir, listSkills } from "./layout";
export type { Layout, LayoutOptions } from "./layout";

export { parseFrontMatter, countWords } from "./frontmatter";
export type { FrontMatter } from "./frontmatter";

export { wire } from "./wire";
export type { WireAction, WireResult } from "./wire";

export {
  check,
  compactReport,
  checkFolder,
  checkFrontMatter,
  checkShape,
  checkRunTrace,
  checkLibrary,
  checkWired,
  checkDependencies,
  dependencySection,
  MAX_DESCRIPTION_WORDS,
  MAX_SKILL_LINES,
} from "./check";
export type { CheckId, Status, CheckResult, SkillReport, CheckReport, CheckOptions } from "./check";

export { triggerEval, findSkillCreator, findPython, readEvalSet } from "./trigger-eval";
export type { TriggerEvalOptions, TriggerEvalResult, QueryResult, SkillCreatorEnv } from "./trigger-eval";

export { handleMessage, serve, skillPath, version } from "./mcp";
