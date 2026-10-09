import { describe, expect, it } from "vitest";
import {
  compass8,
  popQualifier,
  precipKind,
  rainAmountPhrase,
  skyPhrase,
  snowRangePhrase,
  tempCategory,
  windPhrase,
} from "./phrases.js";

describe("compass8", () => {
  it("maps degrees to 8-point compass names", () => {
    expect(compass8(0)).toBe("north");
    expect(compass8(45)).toBe("northeast");
    expect(compass8(90)).toBe("east");
    expect(compass8(180)).toBe("south");
    expect(compass8(270)).toBe("west");
    expect(compass8(359)).toBe("north");
    expect(compass8(-45)).toBe("northwest");
  });
});

describe("skyPhrase", () => {
  it("applies ZFP Table 3 cover thresholds", () => {
    expect(skyPhrase(null, true)).toBeNull();
    expect(skyPhrase(0, true)).toBe("sunny");
    expect(skyPhrase(0, false)).toBe("clear");
    expect(skyPhrase(30, true)).toBe("partly cloudy");
    expect(skyPhrase(60, false)).toBe("mostly cloudy");
    expect(skyPhrase(100, true)).toBe("cloudy");
  });
});

describe("popQualifier", () => {
  it("applies ZFP Table 1 bands with convective variants", () => {
    expect(popQualifier(5, false)).toBeNull();
    expect(popQualifier(20, false)).toBe("slight chance");
    expect(popQualifier(20, true)).toBe("isolated");
    expect(popQualifier(40, false)).toBe("chance");
    expect(popQualifier(40, true)).toBe("scattered");
    expect(popQualifier(60, false)).toBe("likely");
    expect(popQualifier(60, true)).toBe("numerous");
    expect(popQualifier(85, false)).toBeNull();
  });
});

describe("precipKind", () => {
  it("classifies precipitation by amount", () => {
    expect(precipKind(0, 0, 0)).toBeNull();
    expect(precipKind(0, 1, 0)).toBe("snow");
    expect(precipKind(2, 0, 0)).toBe("rain");
    expect(precipKind(0.5, 0, 0.8)).toBe("showers");
    expect(precipKind(2, 0, 0.8)).toBe("rain-showers");
  });
});

describe("tempCategory", () => {
  it("uses decade bands with plain words at the edges", () => {
    expect(tempCategory(20, "us")).toBe("in the upper 60s");
    expect(tempCategory(0, "us")).toBe("in the lower 30s");
    expect(tempCategory(-15, "us")).toBe("in the single digits");
    expect(tempCategory(-20, "us")).toBe("around -4");
    expect(tempCategory(20, "metric")).toBe("around 20");
    expect(tempCategory(5, "metric")).toBe("in the single digits");
    expect(tempCategory(-3, "metric")).toBe("around -3");
  });
});

describe("rainAmountPhrase", () => {
  it("formats rainfall with the spelled-out inch unit", () => {
    expect(rainAmountPhrase(5, "metric")).toBe("5.0 mm");
    expect(rainAmountPhrase(25.4, "us")).toBe("1.00 inch");
    expect(rainAmountPhrase(50.8, "us")).toBe("2.00 inches");
  });
});

describe("snowRangePhrase", () => {
  it("buckets accumulations per ZFP Table 4", () => {
    expect(snowRangePhrase(0.2, "us")).toBe("little or no accumulation");
    expect(snowRangePhrase(1, "us")).toBe("around an inch");
    expect(snowRangePhrase(30, "us")).toBe("more than 2 feet");
    expect(snowRangePhrase(0.5, "metric")).toBe("little or no accumulation");
    expect(snowRangePhrase(50, "metric")).toBe("more than 40 cm");
  });
});

describe("windPhrase", () => {
  it("returns null without a speed and light-and-variable when calm", () => {
    expect(windPhrase(90, null, null)).toBeNull();
    expect(windPhrase(90, 3, null)).toEqual({
      text: "winds light and variable",
      lightVariable: true,
    });
  });

  it("ranges US winds in spec buckets with gusts", () => {
    // 16 kph ≈ 10 mph → "5 to 10 mph"; gust 48 kph ≈ 30 mph qualifies.
    expect(windPhrase(90, 16, 48, "us")).toEqual({
      text: "east winds 5 to 10 mph with gusts to 30 mph",
      lightVariable: false,
    });
    expect(windPhrase(null, 16, null, "us")?.text).toBe("winds 5 to 10 mph");
  });

  it("ranges metric winds in 10 kph buckets", () => {
    expect(windPhrase(180, 25, null, "metric")?.text).toBe(
      "south winds 20 to 30 kph",
    );
  });
});
