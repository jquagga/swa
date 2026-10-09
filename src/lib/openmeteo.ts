// Open-Meteo transport: SDK for forecast (FlatBuffers), plain fetch for
// geocoding (no SDK) and BigDataCloud reverse. Converts SDK responses to
// the plain HourlySeries the ZFP library consumes.

import type { HourlySeries } from "#lib/zfp/index.js";

export interface GeocodingResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  countryCode?: string;
  admin1?: string;
  timezone?: string;
  population?: number;
}

export interface OpenMeteoFetch {
  series: HourlySeries;
  timezone: string;
  utcOffsetSeconds: number;
  latitude: number;
  longitude: number;
}

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

const HOURLY_VARS = [
  "temperature_2m",
  "relative_humidity_2m",
  "apparent_temperature",
  "precipitation_probability",
  "precipitation",
  "rain",
  "showers",
  "snowfall",
  "cloud_cover",
  "cloud_cover_low",
  "cloud_cover_mid",
  "cloud_cover_high",
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "visibility",
  "is_day",
  "weather_code",
].join(",");

export async function searchCity(
  name: string,
  language = "en",
  count = 5,
  signal?: AbortSignal,
): Promise<GeocodingResult[]> {
  const url =
    `${GEOCODING_URL}?name=${encodeURIComponent(name.trim())}` +
    `&count=${count}&language=${encodeURIComponent(language)}&format=json`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Geocoding error: ${res.status}`);
  const data = (await res.json()) as { results?: GeocodingResult[] };
  return data.results ?? [];
}

export interface ReverseLabel {
  label: string;
}

/** Keyless reverse-geocode via the same-origin `/reverse` proxy
 * (OpenStreetMap Nominatim), with graceful fallback to coords. */
export async function reverseLabel(
  latitude: number,
  longitude: number,
  language = "en",
  signal?: AbortSignal,
): Promise<ReverseLabel> {
  const primary = (language.split(/[-_]/)[0] || "en").toLowerCase();
  try {
    const res = await fetch(
      `/reverse?lat=${latitude}&lon=${longitude}&language=${encodeURIComponent(primary)}`,
      { signal },
    );
    if (!res.ok) throw new Error(`reverse ${res.status}`);
    const data = (await res.json()) as { label?: string };
    if (data.label) return { label: data.label };
  } catch {
    // fall through to coords fallback
  }
  return { label: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` };
}

/** Fetch hourly forecast via the `openmeteo` SDK (dynamic import). */
export async function fetchOpenMeteo(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<OpenMeteoFetch> {
  const { fetchWeatherApi } = await import("openmeteo");
  const params = {
    latitude,
    longitude,
    timezone: "auto",
    forecast_days: 7,
    models: "best_match",
    hourly: HOURLY_VARS,
  };
  const responses = await fetchWeatherApi(FORECAST_URL, params, 3, 0.2, 2, {
    signal,
  } as RequestInit);
  const response = responses[0];
  if (!response) throw new Error("Empty Open-Meteo response");

  const utcOffsetSeconds = response.utcOffsetSeconds();
  const timezone = response.timezone() ?? "UTC";
  const hourly = response.hourly();
  if (!hourly) throw new Error("Missing hourly data");

  // FlatBuffers returns a start time + interval as TRUE UTC unix seconds;
  // expand to per-step absolute instants. All display/period code formats
  // these with the explicit IANA `timeZone` below (never the device zone),
  // and compares them against the real clock. Do NOT add utcOffsetSeconds
  // here: that SDK-readme pattern produces wall-clock-as-UTC Dates which
  // are only valid with UTC formatting, and we format zoned.
  const startSec = Number(hourly.time());
  const intervalSec = hourly.interval() || 3600;
  const firstVals = hourly.variables(0)?.valuesArray();
  const n = firstVals?.length ?? 0;
  if (!Number.isFinite(startSec) || n === 0)
    throw new Error("Empty hourly data");
  const timeMs = Array.from(
    { length: n },
    (_, i) => (startSec + i * intervalSec) * 1000,
  );
  const at = (i: number): (number | null)[] => {
    try {
      const arr = hourly.variables(i)?.valuesArray();
      if (!arr) return timeMs.map(() => null);
      const out = Array.from(arr.slice(0, n));
      while (out.length < n) out.push(NaN);
      return out.map((v) => (Number.isFinite(v) ? v : null));
    } catch {
      return timeMs.map(() => null);
    }
  };

  const series: HourlySeries = {
    timeMs,
    temperatureC: at(0),
    humidity: at(1),
    apparentC: at(2),
    pop: at(3),
    precipMm: at(4),
    rainMm: at(5),
    showersMm: at(6),
    snowfallCm: at(7),
    cloudCover: at(8),
    cloudLow: at(9),
    cloudMid: at(10),
    cloudHigh: at(11),
    windKph: at(12),
    windDeg: at(13),
    windGustKph: at(14),
    visibilityM: at(15),
    isDay: at(16),
    wmoCode: at(17),
    timeZone: timezone,
  };
  return {
    series,
    timezone,
    utcOffsetSeconds,
    latitude: response.latitude(),
    longitude: response.longitude(),
  };
}

export interface HourPoint {
  timeMs: number;
  label: string;
  iso: string;
  temp: number;
  feelsLike: number;
  pop: number;
  wind: string;
  humidity: number;
}

/** Next-24h chart/table rows from hour-0, in display units. */
export function buildHourlyDisplay(
  series: HourlySeries,
  units: "metric" | "us",
  hourLabelFmt: Intl.DateTimeFormat,
  nowMs = Date.now(),
  maxHours = 25,
): HourPoint[] {
  const out: HourPoint[] = [];
  for (let i = 0; i < series.timeMs.length && out.length < maxHours; i++) {
    const ms = series.timeMs[i];
    if (!Number.isFinite(ms) || ms + 3600_000 <= nowMs) continue;
    const tC = series.temperatureC[i];
    const fC = series.apparentC[i];
    if (tC == null || fC == null) continue;
    const temp =
      units === "us" ? Math.round((tC * 9) / 5 + 32) : Math.round(tC);
    const feelsLike =
      units === "us" ? Math.round((fC * 9) / 5 + 32) : Math.round(fC);
    const windKph = series.windKph[i];
    const wind =
      windKph == null
        ? "—"
        : units === "us"
          ? `${Math.round(windKph * 0.621371)} mph`
          : `${Math.round(windKph)} kph`;
    const date = new Date(ms);
    out.push({
      timeMs: ms,
      label: hourLabelFmt.format(date),
      iso: date.toISOString(),
      temp,
      feelsLike,
      pop: Math.round(series.pop[i] ?? 0),
      wind,
      humidity: Math.round(series.humidity[i] ?? 0),
    });
  }
  return out;
}
