import { PassThrough } from "node:stream";
import { handleMessage, PROTOCOL_VERSIONS, serve, TOOLS } from "../../src/mcp";
import { addSkill, cleanup, newProject } from "../fixtures/project";

afterEach(cleanup);

const call = (method: string, params?: Record<string, unknown>, id: number | undefined = 1) =>
  handleMessage({ jsonrpc: "2.0", id, method, params }) as { result?: Record<string, unknown>; error?: { code: number } };

describe("MCP handshake", () => {
  it("answers with the version the client asked for when it knows it", () => {
    expect(call("initialize", { protocolVersion: "2025-03-26" }).result!.protocolVersion).toBe("2025-03-26");
  });

  it("offers its newest version for one it does not know", () => {
    expect(call("initialize", { protocolVersion: "1999-01-01" }).result!.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
  });

  it("declares tools and prompts", () => {
    const r = call("initialize", { protocolVersion: PROTOCOL_VERSIONS[0] }).result!;
    expect(r.capabilities).toEqual({ tools: { listChanged: false }, prompts: { listChanged: false } });
    expect((r.serverInfo as { name: string }).name).toBe("easysk");
  });

  it("does not answer notifications", () => {
    expect(handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
  });

  it("answers ping, and errors on an unknown method or a bad message", () => {
    expect(call("ping").result).toEqual({});
    expect(call("nope").error!.code).toBe(-32601);
    expect((handleMessage({ jsonrpc: "1.0" as "2.0", id: 1 }) as { error: { code: number } }).error.code).toBe(-32600);
  });
});

describe("MCP tools", () => {
  it("lists check and wire, check marked read-only", () => {
    const tools = call("tools/list").result!.tools as typeof TOOLS;
    expect(tools.map((t) => t.name)).toEqual(["easysk_check", "easysk_wire"]);
    expect(tools[0]!.annotations.readOnlyHint).toBe(true);
  });

  it("runs check in the given folder", () => {
    const root = newProject();
    addSkill(root, "alpha");
    const r = call("tools/call", { name: "easysk_check", arguments: { cwd: root } }).result!;
    const report = r.structuredContent as { summary: { checked: number }; skills: { name: string }[] };
    expect(report.summary.checked).toBe(1);
    expect(JSON.parse((r.content as { text: string }[])[0]!.text)).toEqual(report);
  });

  it("runs wire as a dry run", () => {
    const root = newProject();
    addSkill(root, "alpha");
    const r = call("tools/call", { name: "easysk_wire", arguments: { cwd: root, dry_run: true } }).result!;
    expect((r.structuredContent as { created: number; dryRun: boolean })).toMatchObject({ created: 1, dryRun: true });
  });

  it("rejects an unknown tool", () => {
    expect(call("tools/call", { name: "rm_rf", arguments: {} }).error!.code).toBe(-32602);
  });
});

describe("MCP prompt", () => {
  it("lists the easysk prompt", () => {
    const prompts = call("prompts/list").result!.prompts as { name: string }[];
    expect(prompts.map((p) => p.name)).toEqual(["easysk"]);
  });

  it("returns the skill's instructions, without front matter, with the user's command", () => {
    const r = call("prompts/get", { name: "easysk", arguments: { command: "audit" } }).result!;
    const text = (r.messages as { content: { text: string } }[])[0]!.content.text;
    expect(text).toContain("## How to call it");
    expect(text).not.toMatch(/^---\nname:/m);
    expect(text.trimEnd().endsWith("The user typed: /easysk audit")).toBe(true);
    expect(text).toContain("`.easysk/runs/`"); // traces belong in the project, not the package cache
  });

  it("errors on an unknown prompt", () => {
    expect(call("prompts/get", { name: "nope" }).error!.code).toBe(-32602);
  });
});

describe("serve", () => {
  it("speaks one JSON message per line, and skips notifications", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const lines: string[] = [];
    output.on("data", (chunk: Buffer) => lines.push(...chunk.toString().split("\n").filter(Boolean)));
    serve(input, output);

    input.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) + "\n");
    input.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    input.write("not json\n");
    input.end();
    await new Promise((r) => setTimeout(r, 50));

    expect(lines.map((l) => JSON.parse(l))).toEqual([
      { jsonrpc: "2.0", id: 1, result: {} },
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } },
    ]);
  });
});
