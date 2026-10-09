import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadOpenMeteoSnapshot,
  openMeteoCacheKey,
  saveOpenMeteoSnapshot,
  type OpenMeteoSnapshot,
} from "./openmeteo-cache.js";
import type { HourlySeries } from "./zfp/index.js";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  } as Storage;
}

function series(): HourlySeries {
  const fill = (v: number | null): (number | null)[] => [v, v, v];
  return {
    timeMs: [1, 2, 3],
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
    timeZone: "UTC",
  };
}

function snapshot(): Omit<OpenMeteoSnapshot, "savedAt"> {
  return {
    series: series(),
    periods: [],
    placeName: "Berlin, Germany",
    timezone: "Europe/Berlin",
    units: "metric",
    locale: "en",
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("openMeteoCacheKey", () => {
  it("uses the separate openmeteo namespace", () => {
    expect(openMeteoCacheKey(52.5, 13.4)).toBe("swa:openmeteo:52.5000,13.4000");
  });
});

describe("save/load roundtrip", () => {
  it("persists and restores a snapshot", () => {
    saveOpenMeteoSnapshot(52.5, 13.4, snapshot());
    const loaded = loadOpenMeteoSnapshot(52.5, 13.4);
    expect(loaded?.placeName).toBe("Berlin, Germany");
    expect(loaded?.series.timeMs).toEqual([1, 2, 3]);
  });

  it("returns null on a miss", () => {
    expect(loadOpenMeteoSnapshot(0, 0)).toBeNull();
  });

  it("rejects stale snapshots past the 1h TTL", () => {
    saveOpenMeteoSnapshot(52.5, 13.4, snapshot());
    const key = openMeteoCacheKey(52.5, 13.4);
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("expected cached payload");
    const data = JSON.parse(raw) as { savedAt: string };
    data.savedAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
    localStorage.setItem(key, JSON.stringify(data));
    expect(loadOpenMeteoSnapshot(52.5, 13.4)).toBeNull();
  });

  it("rejects other cache versions", () => {
    saveOpenMeteoSnapshot(52.5, 13.4, snapshot());
    const key = openMeteoCacheKey(52.5, 13.4);
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("expected cached payload");
    const data = JSON.parse(raw) as { v: number };
    data.v = 99;
    localStorage.setItem(key, JSON.stringify(data));
    expect(loadOpenMeteoSnapshot(52.5, 13.4)).toBeNull();
  });

  it("caps at 10 tiles without touching the NWS namespace", () => {
    localStorage.setItem("swa:weather:38.9000,-77.0000", "{}");
    for (let i = 0; i < 11; i++) {
      saveOpenMeteoSnapshot(50 + i, 13.4, snapshot());
    }
    expect(loadOpenMeteoSnapshot(50, 13.4)).toBeNull();
    expect(loadOpenMeteoSnapshot(60, 13.4)).not.toBeNull();
    expect(localStorage.getItem("swa:weather:38.9000,-77.0000")).toBe("{}");
  });
});
