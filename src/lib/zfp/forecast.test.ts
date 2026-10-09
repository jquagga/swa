import { describe, expect, it } from "vitest";
import { buildForecast } from "./index.js";
import { mapWeatherToEmoji } from "../weather-emoji.js";
import type { HourlySeries } from "./types.js";

const HOUR_MS = 3_600_000;
const START = Date.UTC(2026, 5, 15, 0);

function series(): HourlySeries {
  const n = 96;
  const fill = (v: number | null): (number | null)[] => Array(n).fill(v);
  return {
    timeMs: Array.from({ length: n }, (_, i) => START + i * HOUR_MS),
    // Warming trend with an afternoon shower on day 2.
    temperatureC: Array.from({ length: n }, (_, i) => 15 + i * 0.2),
    humidity: fill(55),
    apparentC: Array.from({ length: n }, (_, i) => 15 + i * 0.2),
    pop: Array.from({ length: n }, (_, i) => (i >= 30 && i < 36 ? 80 : 5)),
    precipMm: Array.from({ length: n }, (_, i) =>
      i >= 30 && i < 36 ? 1.5 : 0,
    ),
    rainMm: fill(0),
    showersMm: Array.from({ length: n }, (_, i) =>
      i >= 30 && i < 36 ? 1.5 : 0,
    ),
    snowfallCm: fill(0),
    cloudCover: Array.from({ length: n }, (_, i) =>
      i >= 30 && i < 36 ? 90 : 20,
    ),
    cloudLow: fill(0),
    cloudMid: fill(0),
    cloudHigh: fill(0),
    windKph: fill(12),
    windDeg: fill(180),
    windGustKph: fill(20),
    visibilityM: fill(10_000),
    isDay: fill(1),
    wmoCode: Array.from({ length: n }, (_, i) => (i >= 30 && i < 36 ? 61 : 1)),
    timeZone: "America/Chicago",
  };
}

describe("buildForecast pipeline", () => {
  it("narrates every live period in order", () => {
    const periods = buildForecast(series(), {
      locale: "en",
      units: "metric",
      nowMs: START + HOUR_MS,
    });
    expect(periods.length).toBeGreaterThan(0);
    for (const p of periods) {
      expect(p.narrativeEn.length).toBeGreaterThan(0);
      expect(p.shortEn.length).toBeGreaterThan(0);
      // shortEn feeds the emoji matcher on the weather pages.
      expect(typeof mapWeatherToEmoji(p.shortEn)).toBe("string");
    }
    const starts = periods.map((p) => p.summary.period.startMs);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    expect(starts[0]).toBeLessThanOrEqual(START + HOUR_MS);
  });

  it("translates and converts units without breaking the pipeline", () => {
    const base = buildForecast(series(), {
      locale: "en",
      units: "metric",
      nowMs: START + HOUR_MS,
    });
    for (const locale of ["es", "fr"] as const) {
      const localized = buildForecast(series(), {
        locale,
        units: "metric",
        nowMs: START + HOUR_MS,
      });
      expect(localized).toHaveLength(base.length);
      for (const p of localized) {
        expect(p.narrative.length).toBeGreaterThan(0);
      }
    }
    const us = buildForecast(series(), {
      locale: "en",
      units: "us",
      nowMs: START + HOUR_MS,
    });
    expect(us).toHaveLength(base.length);
    expect(us[0].narrativeEn).not.toBe(base[0].narrativeEn);
  });
});
