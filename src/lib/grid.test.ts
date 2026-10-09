import { describe, expect, it } from "vitest";
import {
  buildHourlyChartData,
  convertGridTemperature,
  convertGridWindSpeed,
  expandLayerIntervals,
  lookupIntervalValue,
  parseIsoDurationMs,
  parseValidTime,
  type GridQuantLayer,
} from "./grid.js";

const HOUR = "2026-06-15T00:00:00+00:00";

function layer(
  uom: string,
  entries: Array<[string, number | null]>,
): GridQuantLayer {
  return {
    uom,
    values: entries.map(([validTime, value]) => ({ validTime, value })),
  };
}

describe("parseIsoDurationMs", () => {
  it("parses the NWS subset", () => {
    expect(parseIsoDurationMs("PT1H")).toBe(3_600_000);
    expect(parseIsoDurationMs("PT30M")).toBe(1_800_000);
    expect(parseIsoDurationMs("P1D")).toBe(86_400_000);
    expect(parseIsoDurationMs("P1DT2H")).toBe(93_600_000);
  });

  it("rejects empty and unknown shapes", () => {
    expect(parseIsoDurationMs("P")).toBeNull();
    expect(parseIsoDurationMs("PT1S")).toBeNull();
    expect(parseIsoDurationMs("tomorrow")).toBeNull();
  });
});

describe("parseValidTime", () => {
  it("expands start/duration pairs", () => {
    const parsed = parseValidTime(`${HOUR}/PT3H`);
    expect(parsed).toEqual({
      startMs: Date.parse(HOUR),
      endMs: Date.parse(HOUR) + 3 * 3_600_000,
    });
  });

  it("accepts explicit end timestamps", () => {
    const parsed = parseValidTime(`${HOUR}/2026-06-15T02:00:00+00:00`);
    if (!parsed) throw new Error("expected parsed validTime");
    expect(parsed.endMs - parsed.startMs).toBe(2 * 3_600_000);
  });

  it("rejects malformed and inverted ranges", () => {
    expect(parseValidTime("not-a-time")).toBeNull();
    expect(parseValidTime(`${HOUR}/2026-06-14T00:00:00+00:00`)).toBeNull();
  });
});

describe("expandLayerIntervals / lookupIntervalValue", () => {
  it("sorts intervals and skips unparseable entries", () => {
    const intervals = expandLayerIntervals(
      layer("wmoUnit:degC", [
        [`${HOUR}/PT1H`, 20],
        ["bogus", 99],
        [`2026-06-14T23:00:00+00:00/PT1H`, 10],
      ]),
    );
    expect(intervals.map((i) => i.value)).toEqual([10, 20]);
  });

  it("does a step-function lookup with half-open bounds", () => {
    const intervals = expandLayerIntervals(
      layer("wmoUnit:degC", [[`${HOUR}/PT2H`, 20]]),
    );
    const start = Date.parse(HOUR);
    expect(lookupIntervalValue(intervals, start)).toBe(20);
    expect(lookupIntervalValue(intervals, start + 3_599_999)).toBe(20);
    expect(lookupIntervalValue(intervals, start + 7_200_000)).toBeNull();
    expect(lookupIntervalValue(intervals, start - 1)).toBeNull();
  });
});

describe("unit conversions", () => {
  it("converts degC to degF, passing degF through", () => {
    expect(convertGridTemperature(20, "wmoUnit:degC")).toBe(68);
    expect(convertGridTemperature(68, "wmoUnit:degF")).toBe(68);
    expect(convertGridTemperature(null, "wmoUnit:degC")).toBeNull();
  });

  it("converts km/h and m/s to mph", () => {
    expect(convertGridWindSpeed(10, "wmoUnit:km_h-1")).toBeCloseTo(6.21, 2);
    expect(convertGridWindSpeed(10, "wmoUnit:m_s-1")).toBeCloseTo(22.37, 2);
    expect(convertGridWindSpeed(7, "wmoUnit:mph")).toBe(7);
  });
});

describe("buildHourlyChartData", () => {
  const fmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    timeZone: "UTC",
  });

  it("expands temperature intervals into converted hourly slots", () => {
    const data = buildHourlyChartData(
      {
        temperature: layer("wmoUnit:degC", [[`${HOUR}/PT3H`, 20]]),
        probabilityOfPrecipitation: layer("wmoUnit:percent", [
          [`${HOUR}/PT3H`, 50],
        ]),
        windSpeed: layer("wmoUnit:km_h-1", [[`${HOUR}/PT3H`, 10]]),
      },
      fmt,
      Date.parse(HOUR) - 1000,
    );
    expect(data.tempValues).toEqual([68, 68, 68]);
    expect(data.popValues).toEqual([50, 50, 50]);
    expect(data.windLabels).toEqual(["6 mph", "6 mph", "6 mph"]);
    expect(data.isos[0]).toBe(new Date(Date.parse(HOUR)).toISOString());
    expect(data.heatIndexValues).toEqual([null, null, null]);
    expect(data.windChillValues).toEqual([null, null, null]);
  });

  it("skips past hours and caps the slot count", () => {
    const data = buildHourlyChartData(
      { temperature: layer("wmoUnit:degC", [[`${HOUR}/PT5H`, 20]]) },
      fmt,
      Date.parse(HOUR) + 2 * 3_600_000 + 1000,
      2,
    );
    // Slots 00 and 01 have fully ended; the live 02:00 slot leads, capped at 2.
    expect(data.tempValues).toHaveLength(2);
    expect(data.isos[0]).toBe(
      new Date(Date.parse(HOUR) + 2 * 3_600_000).toISOString(),
    );
  });

  it("returns empty data without a temperature layer", () => {
    const data = buildHourlyChartData({}, fmt, 0);
    expect(data.labels).toEqual([]);
    expect(data.tempValues).toEqual([]);
  });
});
