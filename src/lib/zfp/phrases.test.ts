import { describe, expect, it } from "vitest";
import { EN_DICT, withFallback } from "./dictionary.js";
import {
  compass8,
  dirText,
  popQualifier,
  popText,
  precipKind,
  rainAmountPhrase,
  skyPhrase,
  skyText,
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

  it("renders through the dictionary (prepositional dirs, patterns)", () => {
    const dict = withFallback({
      wind_calm: "vientos ligeros y variables",
      wind_with_dir: (dir, range) => `vientos ${dir} ${range}`,
      wind_no_dir: (range) => `vientos ${range}`,
      wind_gusts: (base, gust) => `${base} con ráfagas de ${gust}`,
      range: (a, b, unit) => `${a} a ${b} ${unit}`,
      dir_east: "del este",
    });
    expect(windPhrase(90, 16, 48, "us", dict)?.text).toBe(
      "vientos del este 5 a 10 mph con ráfagas de 30 mph",
    );
    expect(windPhrase(null, 16, null, "us", dict)?.text).toBe(
      "vientos 5 a 10 mph",
    );
    expect(windPhrase(90, 3, null, "metric", dict)?.text).toBe(
      "vientos ligeros y variables",
    );
  });
});

describe("dictionary lookups", () => {
  it("maps sky and qualifier ids with English fallback", () => {
    expect(skyText("sunny", EN_DICT)).toBe("sunny");
    expect(skyText("bogus", EN_DICT)).toBe("cloudy");
    expect(popText("likely", EN_DICT)).toBe("likely");
    expect(popText("bogus", EN_DICT)).toBe("chance");
    expect(dirText("north", EN_DICT)).toBe("north");
    const dict = withFallback({ sky_sunny: "soleado" });
    expect(skyText("sunny", dict)).toBe("soleado");
    expect(skyText("cloudy", dict)).toBe("cloudy");
  });

  it("formats temps and amounts through dictionary templates", () => {
    expect(tempCategory(20, "us", EN_DICT)).toBe("in the upper 60s");
    const dict = withFallback({
      temp_upper: (decade) => `altos ${decade}`,
      temp_around: (value) => `alrededor de ${value}`,
    });
    expect(tempCategory(20, "us", dict)).toBe("altos 60");
    expect(tempCategory(20, "metric", dict)).toBe("alrededor de 20");
    expect(rainAmountPhrase(25.4, "us", dict)).toBe("1.00 inch");
    expect(snowRangePhrase(1, "us", dict)).toBe("around an inch");
  });
});
