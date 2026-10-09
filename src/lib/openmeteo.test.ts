import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWeatherApi } from "openmeteo";
import { buildHourlyDisplay, fetchOpenMeteo, searchCity } from "./openmeteo.js";
import type { HourlySeries } from "./zfp/index.js";

vi.mock("openmeteo", () => ({ fetchWeatherApi: vi.fn() }));
const fetchWeatherApiMock = vi.mocked(fetchWeatherApi);

// Thu 2026-01-01 00:00Z == Wed 19:00 EST (America/New_York, UTC-5).
const T0 = Date.UTC(2026, 0, 1, 0);
const HOUR_MS = 3_600_000;

function series(n: number, startMs = T0): HourlySeries {
  const fill = (v: number | null): (number | null)[] => Array(n).fill(v);
  return {
    timeMs: Array.from({ length: n }, (_, i) => startMs + i * HOUR_MS),
    temperatureC: fill(20),
    humidity: fill(60),
    apparentC: fill(18),
    pop: fill(50),
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
    isDay: fill(0),
    wmoCode: fill(0),
    timeZone: "America/New_York",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchOpenMeteo", () => {
  function mockSdk() {
    const col = (vals: number[]) => ({
      valuesArray: () => Float32Array.from(vals),
    });
    const response = {
      utcOffsetSeconds: () => -18_000,
      timezone: () => "America/New_York",
      latitude: () => 40.71,
      longitude: () => -74.0,
      hourly: () => ({
        time: () => BigInt(T0 / 1000),
        interval: () => 3600,
        variables: (i: number) =>
          col(
            [
              [0, 1, 2],
              [50, 50, 50],
              [-1, 0, 1],
              [10, 20, 30],
            ][i] ?? [0, 0, 0],
          ),
      }),
    };
    fetchWeatherApiMock.mockResolvedValue([response] as never);
  }

  it("expands FlatBuffers start+interval to TRUE UTC instants (no utcOffset shift)", async () => {
    mockSdk();
    const { series: s, timezone } = await fetchOpenMeteo(40.71, -74.0);
    // Regression pin: the old SDK-readme pattern added utcOffsetSeconds,
    // producing wall-clock-as-UTC instants (5h early here).
    expect(s.timeMs).toEqual([T0, T0 + HOUR_MS, T0 + 2 * HOUR_MS]);
    expect(timezone).toBe("America/New_York");
    const firstMs = s.timeMs[0] ?? Number.NaN;
    const hour = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/New_York",
    }).format(new Date(firstMs));
    expect(hour).toBe("19");
    expect(s.temperatureC).toEqual([0, 1, 2]);
    expect(s.pop).toEqual([10, 20, 30]);
  });

  it("requests best_match models with timezone=auto", async () => {
    mockSdk();
    await fetchOpenMeteo(40.71, -74.0);
    expect(fetchWeatherApiMock).toHaveBeenCalledOnce();
    const [url, params] = fetchWeatherApiMock.mock.calls[0] as unknown as [
      string,
      { latitude: number; timezone: string; models: string },
    ];
    expect(url).toBe("https://api.open-meteo.com/v1/forecast");
    expect(params.latitude).toBe(40.71);
    expect(params.timezone).toBe("auto");
    expect(params.models).toBe("best_match");
  });
});

describe("searchCity", () => {
  it("returns geocoding candidates", async () => {
    const results = [
      { id: 1, name: "Berlin", latitude: 52.5, longitude: 13.4 },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ results }))),
    );
    await expect(searchCity("Berlin", "en")).resolves.toEqual(results);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("geocoding-api.open-meteo.com"),
      expect.anything(),
    );
  });

  it("returns [] when the payload has no results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({}))),
    );
    await expect(searchCity("Xyzzy", "en")).resolves.toEqual([]);
  });

  it("throws on upstream errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    await expect(searchCity("Berlin", "en")).rejects.toThrow(
      "Geocoding error: 500",
    );
  });
});

describe("buildHourlyDisplay", () => {
  const fmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    timeZone: "America/New_York",
  });

  it("converts units and rounds display fields", () => {
    const rows = buildHourlyDisplay(series(2), "us", fmt, T0 - HOUR_MS, 25);
    expect(rows).toHaveLength(2);
    expect(rows[0].temp).toBe(68);
    expect(rows[0].feelsLike).toBe(64);
    expect(rows[0].wind).toBe("6 mph");
    expect(rows[0].pop).toBe(50);
    expect(rows[0].humidity).toBe(60);
    expect(rows[0].iso).toBe(new Date(T0).toISOString());
  });

  it("keeps metric units on request", () => {
    const rows = buildHourlyDisplay(series(1), "metric", fmt, T0 - HOUR_MS);
    expect(rows[0].temp).toBe(20);
    expect(rows[0].wind).toBe("10 kph");
  });

  it("skips ended hours, null temps, and caps the count", () => {
    const s = series(4);
    s.temperatureC[2] = null;
    const rows = buildHourlyDisplay(s, "metric", fmt, T0 + HOUR_MS, 1);
    // Hour 0 ended; hour 2 has no temp; cap is 1 → only hour 1.
    expect(rows.map((r) => r.timeMs)).toEqual([T0 + HOUR_MS]);
  });
});
