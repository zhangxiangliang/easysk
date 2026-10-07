/**
 * An MCP server over stdio, written by hand to keep zero dependencies.
 *
 *   npx easysk mcp
 *
 * Messages are JSON-RPC 2.0, one per line. It offers:
 * - tools: `easysk_check` and `easysk_wire` — the mechanical half;
 * - a prompt: `easysk` — the skill's own instructions, for agents that do not
 *   load skills. Designing, fixing and rebuilding a skill is a conversation
 *   with the user, so it lives in the prompt, not in a tool.
 *
 * Nothing but protocol messages may go to stdout.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { check, compactReport } from "./check";
import { parseFrontMatter } from "./frontmatter";
import { resolveLayout } from "./layout";
import { wire } from "./wire";

/** Protocol versions this server speaks, newest first. */
export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const packageRoot = join(__dirname, "..");

export function version(): string {
  try {
    return (JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as { version: string }).version;
  } catch {
    return "0.0.0";
  }
}

/** The SKILL.md shipped in the package. */
export function skillPath(): string {
  return join(packageRoot, "skills", "easysk", "SKILL.md");
}

type Id = string | number;
interface Request {
  jsonrpc: "2.0";
  id?: Id | null;
  method?: string;
  params?: Record<string, unknown>;
}
type Response =
  | { jsonrpc: "2.0"; id: Id | null; result: unknown }
  | { jsonrpc: "2.0"; id: Id | null; error: { code: number; message: string } };

const stringList = { type: "array", items: { type: "string" } };
const cwdProp = { type: "string", description: "Project folder to work in (default: where the server was started)" };

export const TOOLS = [
  {
    name: "easysk_check",
    title: "Check skills",
    description:
      "Run every check from the easysk list (C1–C8) that a program can settle, on every skill in the project or the named ones. Returns only failures, checks that need a reader (C5, C8) and notes. Changes nothing.",
    inputSchema: {
      type: "object",
      properties: {
        names: { ...stringList, description: "Only these skills (default: all)" },
        vendored: { ...stringList, description: "Skills copied from elsewhere: they get C6 only" },
        details: { type: "boolean", description: "Return every check, passing ones included" },
        cwd: cwdProp,
      },
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "easysk_wire",
    title: "Link skills into harness folders",
    description:
      "Link every skill in the project's skills/ folder into each harness folder (.claude/skills, .agents/skills). Replaces wrong links and removes dead ones; never touches a real directory. Use dry_run to see the changes first.",
    inputSchema: {
      type: "object",
      properties: {
        dry_run: { type: "boolean", description: "Report what would change and touch nothing" },
        cwd: cwdProp,
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
];

export const PROMPTS = [
  {
    name: "easysk",
    title: "easysk",
    description: "Create, audit, fix, improve or rebuild a skill under one standard structure.",
    arguments: [
      { name: "command", description: "<idea> | audit | fix <name> | improve <name> | rebuild <name>", required: false },
    ],
  },
];

function callTool(name: string, args: Record<string, unknown>): unknown {
  const cwd = typeof args.cwd === "string" ? args.cwd : undefined;
  const layout = resolveLayout({ cwd });
  if (name === "easysk_check") {
    const report = check(layout, {
      names: Array.isArray(args.names) ? (args.names as string[]) : undefined,
      vendored: Array.isArray(args.vendored) ? (args.vendored as string[]) : undefined,
    });
    return args.details === true ? report : compactReport(report);
  }
  if (name === "easysk_wire") return wire(layout, { dryRun: args.dry_run === true });
  throw new Error(`unknown tool: ${name}`);
}

function getPrompt(name: string, args: Record<string, unknown>): unknown {
  if (name !== "easysk") throw new Error(`unknown prompt: ${name}`);
  const file = skillPath();
  const body = parseFrontMatter(readFileSync(file, "utf8")).body.trim();
  const command = typeof args.command === "string" && args.command.trim() ? args.command.trim() : "";
  const text = [
    `You are running the easysk skill. Its files are in ${dirname(file)} — read references/ and best-practice/ from there.`,
    "Where it says to run `npx easysk check` or `npx easysk wire`, you may call the easysk_check and easysk_wire tools instead.",
    "That folder is a package cache, not the user's project: write this skill's own run traces to `.easysk/runs/` in the project root instead of its `data/runs/`, and ask once to add `.easysk/` to the project's .gitignore.",
    "",
    body,
    "",
    `The user typed: /easysk ${command}`.trimEnd(),
  ].join("\n");
  return { description: PROMPTS[0]!.description, messages: [{ role: "user", content: { type: "text", text } }] };
}

/** Handle one message. Returns the response, or null for a notification. Exported for tests. */
export function handleMessage(message: Request): Response | null {
  const id = message.id ?? null;
  const isNotification = message.id === undefined;
  const ok = (result: unknown): Response | null => (isNotification ? null : { jsonrpc: "2.0", id, result });
  const err = (code: number, msg: string): Response | null =>
    isNotification ? null : { jsonrpc: "2.0", id, error: { code, message: msg } };

  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") return err(-32600, "invalid request");
  const params = message.params ?? {};

  switch (message.method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return ok({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } },
        serverInfo: { name: "easysk", title: "easysk", version: version() },
        instructions:
          "easysk keeps a project's agent skills in one shape. Use the easysk prompt for create/audit/fix/improve/rebuild; the tools do the mechanical checks and linking.",
      });
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const name = String(params.name ?? "");
      const args = (params.arguments as Record<string, unknown>) ?? {};
      if (!TOOLS.some((t) => t.name === name)) return err(-32602, `unknown tool: ${name}`);
      try {
        const result = callTool(name, args);
        return ok({ content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result });
      } catch (e) {
        // a tool that ran and failed is a result the model can read, not a protocol error
        return ok({ content: [{ type: "text", text: (e as Error).message }], isError: true });
      }
    }
    case "prompts/list":
      return ok({ prompts: PROMPTS });
    case "prompts/get":
      try {
        return ok(getPrompt(String(params.name ?? ""), (params.arguments as Record<string, unknown>) ?? {}));
      } catch (e) {
        return err(-32602, (e as Error).message);
      }
    default:
      return err(-32601, `method not found: ${message.method}`);
  }
}

/** Read messages from stdin, one per line, and answer on stdout. */
export function serve(input: NodeJS.ReadableStream = process.stdin, output: NodeJS.WritableStream = process.stdout): void {
  const send = (r: unknown): void => {
    output.write(JSON.stringify(r) + "\n");
  };
  createInterface({ input }).on("line", (line) => {
    if (!line.trim()) return;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
      return;
    }
    const batch = Array.isArray(message) ? message : [message];
    const replies = batch.map((m) => handleMessage(m as Request)).filter((r) => r !== null);
    if (Array.isArray(message)) {
      if (replies.length) send(replies);
    } else if (replies[0]) {
      send(replies[0]);
    }
  });
}
