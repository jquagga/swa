import { describe, expect, it } from "vitest";
import {
  celsiusToFahrenheit,
  cmToInches,
  formatPrecip,
  formatSnow,
  formatTemp,
  formatWind,
  kphToMph,
  mmToInches,
} from "./units.js";

describe("celsiusToFahrenheit", () => {
  it("converts reference points", () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(100)).toBe(212);
    expect(celsiusToFahrenheit(-40)).toBe(-40);
  });
});

describe("kphToMph", () => {
  it("applies the 0.621371 factor", () => {
    expect(kphToMph(100)).toBeCloseTo(62.1371, 4);
    expect(kphToMph(0)).toBe(0);
  });
});

describe("mmToInches / cmToInches", () => {
  it("converts reference lengths", () => {
    expect(mmToInches(25.4)).toBeCloseTo(1, 10);
    expect(cmToInches(2.54)).toBeCloseTo(1, 10);
  });
});

describe("formatTemp", () => {
  it("rounds in place for metric, converts for US", () => {
    expect(formatTemp(20.4, "metric")).toBe("20°");
    expect(formatTemp(20, "us")).toBe("68°");
    expect(formatTemp(-17.8, "us")).toBe("0°");
  });
});

describe("formatWind", () => {
  it("labels kph vs mph with rounding", () => {
    expect(formatWind(10, "metric")).toBe("10 kph");
    expect(formatWind(10, "us")).toBe("6 mph");
  });
});

describe("formatPrecip", () => {
  it("uses smart precision per unit system", () => {
    expect(formatPrecip(5, "metric")).toBe("5.0 mm");
    expect(formatPrecip(25, "metric")).toBe("25 mm");
    expect(formatPrecip(5, "us")).toBe("0.20 in");
    expect(formatPrecip(254, "us")).toBe("10.0 in");
  });
});

describe("formatSnow", () => {
  it("uses smart precision per unit system", () => {
    expect(formatSnow(5, "metric")).toBe("5.0 cm");
    expect(formatSnow(20, "metric")).toBe("20 cm");
    expect(formatSnow(2.54, "us")).toBe("1.0 in");
    expect(formatSnow(25.4, "us")).toBe("10 in");
  });
});
