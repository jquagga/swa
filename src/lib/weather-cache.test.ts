import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cacheKey,
  loadCachedSnapshot,
  normalizeCachedAlertSeverity,
  saveCachedSnapshot,
  type CachedSnapshot,
  type WeatherAlert,
} from "./weather-cache.js";

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

function snapshot(): Omit<CachedSnapshot, "savedAt"> {
  return {
    point: { properties: { cwa: "LWX" } },
    alerts: { features: [] },
    forecast: {},
    gridData: { properties: {} },
    NWSURL: "https://forecast.weather.gov/x",
  };
}

function storedRaw(lat: number, lon: number): Record<string, unknown> {
  const raw = localStorage.getItem(cacheKey(lat, lon));
  if (!raw) throw new Error("expected cached payload");
  return JSON.parse(raw) as Record<string, unknown>;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cacheKey", () => {
  it("rounds to 4-decimal tiles with the NWS namespace", () => {
    expect(cacheKey(38.9, -77)).toBe("swa:weather:38.9000,-77.0000");
    expect(cacheKey(38.90004, -77.00004)).toBe("swa:weather:38.9000,-77.0000");
  });
});

describe("save/load roundtrip", () => {
  it("persists and restores a snapshot", () => {
    saveCachedSnapshot(38.9, -77, snapshot());
    const loaded = loadCachedSnapshot(38.9, -77);
    expect(loaded?.NWSURL).toBe("https://forecast.weather.gov/x");
    expect(typeof loaded?.savedAt).toBe("string");
  });

  it("treats nearby coords in the same tile as a hit", () => {
    saveCachedSnapshot(38.90004, -77.00004, snapshot());
    expect(loadCachedSnapshot(38.9, -77)).not.toBeNull();
  });

  it("returns null on a miss", () => {
    expect(loadCachedSnapshot(0, 0)).toBeNull();
  });

  it("rejects stale snapshots past the 1h TTL", () => {
    saveCachedSnapshot(38.9, -77, snapshot());
    const raw = storedRaw(38.9, -77);
    raw.savedAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
    localStorage.setItem(cacheKey(38.9, -77), JSON.stringify(raw));
    expect(loadCachedSnapshot(38.9, -77)).toBeNull();
  });

  it("rejects other cache versions", () => {
    saveCachedSnapshot(38.9, -77, snapshot());
    const raw = storedRaw(38.9, -77);
    raw.v = 1;
    localStorage.setItem(cacheKey(38.9, -77), JSON.stringify(raw));
    expect(loadCachedSnapshot(38.9, -77)).toBeNull();
  });

  it("rejects snapshots without gridpoint properties", () => {
    saveCachedSnapshot(38.9, -77, snapshot());
    const raw = storedRaw(38.9, -77);
    delete raw.gridData;
    localStorage.setItem(cacheKey(38.9, -77), JSON.stringify(raw));
    expect(loadCachedSnapshot(38.9, -77)).toBeNull();
  });
});

describe("tile cap", () => {
  it("evicts the oldest tile past 10 and leaves other namespaces alone", () => {
    localStorage.setItem("swa:openmeteo:1.0000,2.0000", "{}");
    for (let i = 0; i < 11; i++) {
      saveCachedSnapshot(30 + i, -77, snapshot());
    }
    expect(loadCachedSnapshot(30, -77)).toBeNull();
    expect(loadCachedSnapshot(40, -77)).not.toBeNull();
    expect(localStorage.getItem("swa:openmeteo:1.0000,2.0000")).toBe("{}");
    const index = JSON.parse(
      localStorage.getItem("swa:weather:index") ?? "[]",
    ) as unknown[];
    expect(index.length).toBeLessThanOrEqual(10);
  });
});

describe("normalizeCachedAlertSeverity", () => {
  it("maps legacy CSS classes back to NWS severities", () => {
    const alerts = {
      features: [
        { properties: { severity: "pico-background-yellow-100" } },
        { properties: { severity: "pico-background-red-500" } },
        { properties: { severity: "Minor" } },
      ],
    } as unknown as WeatherAlert;
    normalizeCachedAlertSeverity(alerts);
    expect(alerts.features.map((f) => f.properties.severity)).toEqual([
      "Severe",
      "Extreme",
      "Minor",
    ]);
  });

  it("tolerates missing features", () => {
    expect(() =>
      normalizeCachedAlertSeverity({} as WeatherAlert),
    ).not.toThrow();
  });
});
