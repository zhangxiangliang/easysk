import { countWords, parseFrontMatter } from "../../src/frontmatter";

describe("parseFrontMatter", () => {
  it("reads plain, double- and single-quoted fields", () => {
    const fm = parseFrontMatter(`---
name: deploy
description: "Say \\"hi\\" to /deploy"
argument-hint: 'it''s [env]'
---
# body`);
    expect(fm.present).toBe(true);
    expect(fm.fields).toEqual({ name: "deploy", description: 'Say "hi" to /deploy', "argument-hint": "it's [env]" });
    expect(fm.body).toBe("# body");
  });

  it("skips nested blocks", () => {
    const fm = parseFrontMatter("---\nname: x\nmetadata:\n  internal: true\n---\n");
    expect(fm.fields).toEqual({ name: "x" });
  });

  it("handles a BOM and Windows line endings", () => {
    expect(parseFrontMatter("﻿---\r\nname: x\r\n---\r\nbody").fields).toEqual({ name: "x" });
  });

  it("is absent when the block is missing or never closed", () => {
    expect(parseFrontMatter("# just a file").present).toBe(false);
    expect(parseFrontMatter("---\nname: x\n").present).toBe(false);
  });
});

describe("countWords", () => {
  it("counts runs of non-space", () => {
    expect(countWords("  one two\nthree  ")).toBe(3);
    expect(countWords("")).toBe(0);
  });
});
