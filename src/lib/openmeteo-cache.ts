import type { ForecastPeriod, HourlySeries } from "#lib/zfp/index.js";

export interface OpenMeteoSnapshot {
  series: HourlySeries;
  periods: ForecastPeriod[];
  placeName: string;
  timezone: string;
  units: "metric" | "us";
  locale: string;
  savedAt: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHED_TILES = 10;
const CACHE_INDEX_KEY = "swa:openmeteo:index";
const CACHE_KEY_PREFIX = "swa:openmeteo:";
const CACHE_VERSION = 1;

export function openMeteoCacheKey(latitude: number, longitude: number): string {
  return `${CACHE_KEY_PREFIX}${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

function readIndex(): string[] {
  try {
    const raw = localStorage.getItem(CACHE_INDEX_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((k): k is string => typeof k === "string")
      : [];
  } catch {
    return [];
  }
}

export function saveOpenMeteoSnapshot(
  latitude: number,
  longitude: number,
  snapshot: Omit<OpenMeteoSnapshot, "savedAt">,
): void {
  const key = openMeteoCacheKey(latitude, longitude);
  try {
    const payload = JSON.stringify({
      v: CACHE_VERSION,
      ...snapshot,
      savedAt: new Date().toISOString(),
    });
    const merged = [key, ...readIndex().filter((k) => k !== key)];
    const next = merged.slice(0, MAX_CACHED_TILES);
    for (const k of merged.filter((k) => !next.includes(k))) {
      try {
        localStorage.removeItem(k);
      } catch {
        // ignore
      }
    }
    try {
      localStorage.setItem(key, payload);
    } catch {
      const fallback = next.filter((k) => k !== key);
      const oldest = fallback[fallback.length - 1];
      if (!oldest) return;
      try {
        localStorage.removeItem(oldest);
        localStorage.setItem(key, payload);
      } catch {
        return;
      }
    }
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(next));
  } catch {
    // best-effort
  }
}

export function loadOpenMeteoSnapshot(
  latitude: number,
  longitude: number,
): OpenMeteoSnapshot | null {
  try {
    const raw = localStorage.getItem(openMeteoCacheKey(latitude, longitude));
    if (!raw) return null;
    const data = JSON.parse(raw) as OpenMeteoSnapshot & { v?: number };
    if (!data?.savedAt || !data?.series?.timeMs?.length) return null;
    if (data.v !== CACHE_VERSION) return null;
    if (Date.now() - Date.parse(data.savedAt) > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
}
