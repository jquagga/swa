import { describe, expect, it } from "vitest";
import { buildForecast } from "./index.js";
import { EN_DICT, withFallback, type ZfpDictionary } from "./dictionary.js";
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

/**
 * Token dictionary: every entry renders as [key] or [key:args], so tests
 * can prove the builder used the dictionary (not English literals) for a
 * given fragment.
 */
function tokenDict(): ZfpDictionary {
  const out: Record<string, string | ((...args: string[]) => string)> = {};
  for (const [k, v] of Object.entries(EN_DICT)) {
    out[k] =
      typeof v === "function"
        ? (...args: string[]) => `[${k}:${args.join(",")}]`
        : `[${k}]`;
  }
  return out as unknown as ZfpDictionary;
}

describe("buildForecast pipeline", () => {
  it("narrates every live period in order", () => {
    const periods = buildForecast(series(), {
      dictionary: EN_DICT,
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

  it("renders English through the dictionary (no hardcoded literals)", () => {
    const periods = buildForecast(series(), {
      dictionary: tokenDict(),
      units: "metric",
      nowMs: START + HOUR_MS,
    });
    expect(periods.length).toBeGreaterThan(0);
    // The shower period composes qualifier + type + percent + temp + wind
    // entirely from token entries.
    const shower = periods.find((p) => p.narrative.includes("[pop_sentence"));
    expect(shower).toBeDefined();
    expect(shower?.narrative).toContain("[pop_sentence_percent:");
    expect(shower?.narrativeEn).not.toContain("[pop_sentence");
    // narrativeEn always stays English for emoji matching.
    expect(shower?.narrativeEn).toContain("Rain showers.");
    for (const p of periods) {
      expect(p.narrative.length).toBeGreaterThan(0);
      expect(p.short.length).toBeGreaterThan(0);
    }
  });

  it("composes qualifiers through dictionary patterns", () => {
    const s = series();
    // Mid-range PoP with convective showers → "scattered" qualifier.
    s.pop = s.pop.map((v, i) => (i >= 30 && i < 36 ? 40 : v));
    const periods = buildForecast(s, {
      dictionary: tokenDict(),
      units: "metric",
      nowMs: START + HOUR_MS,
    });
    const shower = periods.find((p) => p.narrative.includes("[pop_sentence"));
    expect(shower?.narrative).toContain("[pop_sentence_bare:");
    expect(shower?.narrativeEn).toContain("Scattered rain showers.");
  });

  it("falls back to English for untranslated keys", () => {
    const partial = withFallback({ sky_mostly_clear: "[despejado]" });
    const periods = buildForecast(series(), {
      dictionary: partial,
      units: "metric",
      nowMs: START + HOUR_MS,
    });
    const clear = periods.find((p) => p.narrative.includes("[despejado]"));
    expect(clear).toBeDefined();
    // Wind sentence still renders from the English fallback.
    expect(clear?.narrative).toContain("winds");
  });

  it("converts units without breaking the pipeline", () => {
    const base = buildForecast(series(), {
      dictionary: EN_DICT,
      units: "metric",
      nowMs: START + HOUR_MS,
    });
    const us = buildForecast(series(), {
      dictionary: EN_DICT,
      units: "us",
      nowMs: START + HOUR_MS,
    });
    expect(us).toHaveLength(base.length);
    expect(us[0]?.narrativeEn).not.toBe(base[0]?.narrativeEn);
    expect(us[0]?.narrativeEn).toContain("mph");
    expect(base[0]?.narrativeEn).toContain("kph");
  });
});
