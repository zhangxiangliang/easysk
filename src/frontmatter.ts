/**
 * Read the front matter of a SKILL.md.
 *
 * Zero dependencies, so this is not a YAML parser. It reads the flat
 * `key: value` lines a skill's front matter uses — plain, single-quoted or
 * double-quoted — and skips nested blocks (such as `metadata:`).
 */

export interface FrontMatter {
  /** True when the file opens with a `---` block that is closed. */
  present: boolean;
  /** Top-level string fields, unquoted. */
  fields: Record<string, string>;
  /** Everything after the closing `---`. */
  body: string;
}

export function parseFrontMatter(text: string): FrontMatter {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { present: false, fields: {}, body: text };

  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end === -1) return { present: false, fields: {}, body: text };

  const fields: Record<string, string> = {};
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line); // top level only: no indent
    if (!match) continue;
    const value = unquote(match[2]!.trim());
    if (value !== "") fields[match[1]!] = value;
  }
  return { present: true, fields, body: lines.slice(end + 1).join("\n") };
}

function unquote(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

/** Words in a description, counted the way a reader would: runs of non-space. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
