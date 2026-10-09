import { describe, expect, it } from "vitest";
import { summarizeWmo } from "./wmo.js";

describe("summarizeWmo", () => {
  it("returns zero fractions for empty input", () => {
    const s = summarizeWmo([], 0);
    expect(s.thunderFrac).toBe(0);
    expect(s.precipFrac).toBe(0);
  });

  it("classifies thunder vs rain vs clear codes", () => {
    // 95 thunder, 61 rain, 0 clear, null missing
    const s = summarizeWmo([95, 61, 0, null], 4);
    expect(s.thunderFrac).toBeCloseTo(0.25);
    expect(s.rainFrac).toBeCloseTo(0.25);
    expect(s.precipFrac).toBeCloseTo(0.5);
  });

  it("flags heavy variants and fog subsets", () => {
    const s = summarizeWmo([65, 48, 45], 3);
    expect(s.heavyFrac).toBeCloseTo(1 / 3);
    expect(s.fogFrac).toBeCloseTo(2 / 3);
    expect(s.denseFogFrac).toBeCloseTo(1 / 3);
  });

  it("counts snow and freezing rain separately", () => {
    const s = summarizeWmo([75, 66], 2);
    expect(s.snowFrac).toBeCloseTo(0.5);
    expect(s.freezingRainFrac).toBeCloseTo(0.5);
  });
});
