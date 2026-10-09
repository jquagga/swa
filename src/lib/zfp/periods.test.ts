import { describe, expect, it } from "vitest";
import { localHour, splitDayNight, summarizePeriod } from "./periods.js";
import type { HourlySeries, ZfpPeriod } from "./types.js";

const HOUR_MS = 3_600_000;
const TZ = "America/Chicago";
// Sun 2026-06-15 00:00Z == Sat 19:00 CDT (UTC-5, no DST edge in June).
const START = Date.UTC(2026, 5, 15, 0);

function series(
  n: number,
  overrides: Partial<HourlySeries> = {},
): HourlySeries {
  const fill = (v: number | null): (number | null)[] => Array(n).fill(v);
  return {
    timeMs: Array.from({ length: n }, (_, i) => START + i * HOUR_MS),
    temperatureC: fill(20),
    humidity: fill(50),
    apparentC: fill(19),
    pop: fill(0),
    precipMm: fill(0),
    rainMm: fill(0),
    showersMm: fill(0),
    snowfallCm: fill(0),
    cloudCover: fill(10),
    cloudLow: fill(0),
    cloudMid: fill(0),
    cloudHigh: fill(0),
    windKph: fill(10),
    windDeg: fill(90),
    windGustKph: fill(12),
    visibilityM: fill(10_000),
    isDay: fill(1),
    wmoCode: fill(0),
    timeZone: TZ,
    ...overrides,
  };
}

describe("localHour", () => {
  it("resolves day/night boundaries in the series zone", () => {
    // 06:00 CDT is a day hour; 05:00 is night; 18:00 is night.
    expect(localHour(Date.UTC(2026, 5, 15, 11), TZ)).toBe(6);
    expect(localHour(Date.UTC(2026, 5, 15, 10), TZ)).toBe(5);
    expect(localHour(Date.UTC(2026, 5, 15, 23), TZ)).toBe(18);
    expect(localHour(Date.UTC(2026, 5, 15, 22), TZ)).toBe(17);
  });
});

describe("splitDayNight", () => {
  it("starts with the period containing now, skipping ended hours", () => {
    const s = series(72);
    const nowMs = START + 2 * HOUR_MS;
    const periods = splitDayNight(s, 14, nowMs);
    expect(periods.length).toBeGreaterThan(0);
    const first = periods[0];
    expect(first.startMs).toBeLessThanOrEqual(nowMs);
    expect(nowMs).toBeLessThan(first.endMs);
    // Index 0 (00:00Z) ended at 01:00Z <= now, so it must be excluded.
    expect(first.hours).not.toContain(0);
    for (const p of periods) {
      for (const h of p.hours) {
        expect((s.timeMs[h] ?? Number.NaN) + HOUR_MS).toBeGreaterThan(nowMs);
      }
    }
  });

  it("alternates night/day with contiguous boundaries", () => {
    const s = series(72);
    const periods = splitDayNight(s, 14, START + HOUR_MS);
    expect(periods[0].isDaytime).toBe(false); // 20:00 CDT Saturday
    for (let i = 1; i < periods.length; i++) {
      expect(periods[i].isDaytime).toBe(!periods[i - 1].isDaytime);
      expect(periods[i].startMs).toBe(periods[i - 1].endMs);
    }
  });

  it("caps at maxPeriods", () => {
    const periods = splitDayNight(series(72), 3, START + HOUR_MS);
    expect(periods).toHaveLength(3);
  });

  it("falls back to the full series when everything is past", () => {
    const s = series(48);
    const periods = splitDayNight(s, 14, START + 500 * HOUR_MS);
    expect(periods.length).toBeGreaterThan(0);
    expect(periods[0].startMs).toBe(START);
    expect(periods[0].hours).toContain(0);
  });
});

describe("summarizePeriod", () => {
  it("aggregates temps, trend, wind vector, and extrema", () => {
    const s = series(4, {
      temperatureC: [10, 20, 30, 40],
      pop: [0, 10, 90, 50],
      windKph: [10, 10, 10, 10],
      windDeg: [90, 90, 90, 90],
      windGustKph: [5, 15, 8, 8],
      visibilityM: [1000, 500, 2000, 1500],
    });
    const period: ZfpPeriod = {
      index: 0,
      isDaytime: true,
      startMs: START,
      endMs: START + 4 * HOUR_MS,
      hours: [0, 1, 2, 3],
    };
    const sum = summarizePeriod(s, period);
    expect(sum.tMinC).toBe(10);
    expect(sum.tMaxC).toBe(40);
    expect(sum.tAvgC).toBe(25);
    expect(sum.trendC).toBe(20); // second-half mean 35, first-half 15
    expect(sum.popMax).toBe(90);
    expect(sum.windDirDeg).toBeCloseTo(90, 6);
    expect(sum.windKph).toBeCloseTo(10, 6);
    expect(sum.windGustKph).toBe(15);
    expect(sum.visibilityMinM).toBe(500);
  });

  it("returns nulls for all-missing data", () => {
    const s = series(2, {
      temperatureC: [null, null],
      windKph: [null, null],
      windDeg: [null, null],
    });
    const sum = summarizePeriod(s, {
      index: 0,
      isDaytime: false,
      startMs: START,
      endMs: START + 2 * HOUR_MS,
      hours: [0, 1],
    });
    expect(sum.tMinC).toBeNull();
    expect(sum.tAvgC).toBeNull();
    expect(sum.trendC).toBeNull();
    expect(sum.windDirDeg).toBeNull();
  });
});
