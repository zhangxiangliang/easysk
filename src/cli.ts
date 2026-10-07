#!/usr/bin/env node
/**
 * Command-line interface for easysk. Prints JSON, because it is mostly read by
 * an AI agent running the easysk skill:
 *
 *   npx easysk check            # every check a program can settle, all skills
 *   npx easysk wire             # link skills/ into the harness folders
 *   npx easysk eval <skill> <eval-set.json>
 *   npx easysk mcp              # serve the same tools over MCP (stdio)
 *
 * Zero dependencies: arguments are parsed by hand.
 */
import { check, compactReport } from "./check";
import { resolveLayout } from "./layout";
import { serve, version } from "./mcp";
import { triggerEval } from "./trigger-eval";
import { wire } from "./wire";

export interface CliArgs {
  command: string;
  positional: string[];
  dryRun: boolean;
  details: boolean;
  vendored?: string[];
  skillsDir?: string;
  harnessDirs?: string[];
  runs?: number;
  model?: string;
  description?: string;
  optimize?: number;
  help: boolean;
  version: boolean;
}

const list = (v: string | undefined): string[] | undefined =>
  v === undefined ? undefined : v.split(",").map((s) => s.trim()).filter(Boolean);

const int = (v: string | undefined): number | undefined => {
  const n = Number(v);
  return v !== undefined && Number.isInteger(n) && n > 0 ? n : undefined;
};

/** Read the flags. Exported so the argument rules can be tested on their own. */
export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { command: "", positional: [], dryRun: false, details: false, help: false, version: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    switch (a) {
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "-v":
      case "--version":
        args.version = true;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "--details": // passing checks too; off by default to save tokens
        args.details = true;
        break;
      case "--vendored":
        args.vendored = list(argv[++i]);
        break;
      case "--skills-dir":
        args.skillsDir = argv[++i];
        break;
      case "--harness":
        args.harnessDirs = list(argv[++i]);
        break;
      case "--runs":
        args.runs = int(argv[++i]);
        break;
      case "--model":
        args.model = argv[++i];
        break;
      case "--description":
        args.description = argv[++i];
        break;
      case "--optimize":
        args.optimize = int(argv[++i]);
        break;
      default:
        if (!args.command) args.command = a;
        else args.positional.push(a);
    }
  }
  return args;
}

export const HELP = `easysk — keep every AI agent skill in your project in one shape. Prints JSON.

Run it from your project. The project root is the git top level.

Usage:
  easysk check [name...] [--vendored a,b] [--details]
      Every check from the list (C1–C8) a program can settle. Prints only
      failures, checks that need a reader (C5, C8) and notes, unless
      --details. Exit 1 when a check fails.
  easysk wire [--dry-run]
      Link every skill in skills/ into each harness folder. Replaces wrong
      links, removes dead ones, never touches a real directory (reported as
      stale; exit 1).
  easysk eval <skill-dir> <eval-set.json> [--runs N] [--model ID]
              [--description TEXT] [--optimize ITERATIONS]
      Measure how often the description triggers, with Anthropic's
      skill-creator. --optimize proposes a description; it never edits the
      skill. Exit 1 when a query fails, 2 when it could not run.
  easysk mcp
      Serve the check and wire tools, and the easysk prompt, over MCP (stdio).

Options:
  --skills-dir <dir>   Source folder (default: $SKILLS_DIR, else skills)
  --harness <a,b>      Harness folders (default: $HARNESS_DIRS, else
                       .claude/skills, plus .agents/skills when it exists)
  -v, --version        Print the version
  -h, --help           Show this help`;

function print(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

/** Run one command. Returns the exit code. Exported for tests. */
export function run(args: CliArgs): number {
  if (args.version) {
    process.stdout.write(version() + "\n");
    return 0;
  }
  if (args.help || !args.command) {
    process.stdout.write(HELP + "\n");
    return args.help ? 0 : 2;
  }

  const layout = () => resolveLayout({ skillsDir: args.skillsDir, harnessDirs: args.harnessDirs });

  switch (args.command) {
    case "check": {
      const report = check(layout(), { names: args.positional, vendored: args.vendored ?? listEnv("VENDORED_SKILLS") });
      print(args.details ? report : compactReport(report));
      return report.ok ? 0 : 1;
    }
    case "wire": {
      const result = wire(layout(), { dryRun: args.dryRun });
      print(result);
      return result.stale === 0 ? 0 : 1;
    }
    case "eval": {
      const [skill, evalSet] = args.positional;
      if (!skill || !evalSet) {
        process.stderr.write("usage: easysk eval <skill-dir> <eval-set.json> [options]\n");
        return 2;
      }
      const result = triggerEval({
        skill,
        evalSet,
        runs: args.runs,
        model: args.model,
        description: args.description,
        optimize: args.optimize,
      });
      print(result);
      return result.exitCode;
    }
    case "mcp":
      serve();
      return -1; // keep running until stdin closes
    default:
      process.stderr.write(`easysk: unknown command "${args.command}". Try --help.\n`);
      return 2;
  }
}

function listEnv(name: string): string[] | undefined {
  const v = process.env[name];
  return v ? v.split(/\s+/).filter(Boolean) : undefined;
}

if (require.main === module) {
  const code = run(parseArgs(process.argv.slice(2)));
  if (code >= 0) process.exitCode = code;
}
