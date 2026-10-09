import { describe, expect, it } from "vitest";
import { parseAfdProduct, unwrapNwsHardWrap } from "./afd.js";

const SAMPLE = [
  "000",
  "FXUS63 KTOP 071009",
  "AFDTOP",
  "",
  ".DISCUSSION...",
  "A long first line that certainly exceeds sixty characters in length",
  "continued on the next line.",
  "",
  "Short line stands alone.",
  "",
  "&&",
  "",
  "- First bullet",
  "  continued bullet text",
  "- Second bullet",
  "$$",
].join("\n");

describe("parseAfdProduct", () => {
  it("drops the WMO preamble and terminator", () => {
    const texts = parseAfdProduct(SAMPLE).flatMap((b) =>
      b.kind === "heading" || b.kind === "para" ? [b.text] : [],
    );
    expect(texts.join(" ")).not.toContain("AFDTOP");
    expect(texts.join(" ")).not.toContain("FXUS63");
  });

  it("emits headings, joined paragraphs, dividers, and merged lists", () => {
    expect(parseAfdProduct(SAMPLE)).toEqual([
      { kind: "heading", text: "DISCUSSION" },
      {
        kind: "para",
        text: "A long first line that certainly exceeds sixty characters in length continued on the next line.",
      },
      { kind: "para", text: "Short line stands alone." },
      { kind: "hr" },
      {
        kind: "list",
        items: ["First bullet continued bullet text", "Second bullet"],
      },
    ]);
  });

  it("returns no blocks for empty input", () => {
    expect(parseAfdProduct("")).toEqual([]);
    expect(parseAfdProduct("$$\n")).toEqual([]);
  });
});

describe("unwrapNwsHardWrap", () => {
  it("joins wrapped lines and keeps paragraph breaks", () => {
    const longLine =
      "This alert description line is definitely longer than sixty characters";
    expect(
      unwrapNwsHardWrap(`${longLine}\ncontinuation here.\n\nNext paragraph.`),
    ).toBe(`${longLine} continuation here.\n\nNext paragraph.`);
  });

  it("starts a new paragraph at bullet lines", () => {
    expect(unwrapNwsHardWrap("Intro line.\n* First item\n* Second item")).toBe(
      "Intro line.\n\n* First item\n\n* Second item",
    );
  });
});
