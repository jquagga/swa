import type { GridpointData } from "#lib/grid.js";

export interface WeatherPoint {
  properties?: {
    cwa?: string;
    forecastOffice?: string;
    timeZone?: string;
    astronomicalData?: {
      sunrise?: string;
      sunset?: string;
    };
    relativeLocation?: {
      properties: {
        city: string;
        state: string;
      };
    };
    forecastHourly?: string;
    forecast?: string;
    forecastGridData?: string;
  };
  detail?: string;
}

export interface WeatherAlert {
  features: Array<{
    properties: {
      id: string;
      severity: string;
      event: string;
      description: string;
      instruction: string;
      effective?: string;
    };
  }>;
}

export interface WeatherPeriod {
  name: string;
  shortForecast: string;
  temperature: number;
  temperatureUnit: string;
  isDaytime: boolean;
  detailedForecast: string;
  startTime: string;
  endTime: string;
  windSpeed: string;
  relativeHumidity: {
    value: number | null;
  };
  probabilityOfPrecipitation?: {
    value: number;
  };
  appTemp?: number;
}

export interface ForecastData {
  properties?: {
    periods: WeatherPeriod[];
  };
}

export interface AfdProduct {
  issuanceTime?: string;
  productName?: string;
  productText?: string;
}

export interface CachedSnapshot {
  point: WeatherPoint;
  alerts: WeatherAlert;
  forecast: ForecastData;
  gridData: GridpointData;
  NWSURL: string;
  savedAt: string;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHED_TILES = 10;
const CACHE_INDEX_KEY = "swa:weather:index";
const CACHE_KEY_PREFIX = "swa:weather:";
const CACHE_VERSION = 2;

export function cacheKey(latitude: number, longitude: number): string {
  return `${CACHE_KEY_PREFIX}${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

function readCacheIndex(): string[] {
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

function discoverCacheKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_KEY_PREFIX) && k !== CACHE_INDEX_KEY) {
        keys.push(k);
      }
    }
  } catch {
    // storage unavailable — treat as empty
  }
  return keys;
}

function writeCacheIndex(key: string): void {
  try {
    const merged = [key, ...readCacheIndex().filter((k) => k !== key)];
    // Include any legacy/discovered keys not yet in the index so they
    // stay managed, then keep only the most-recent entries.
    for (const k of discoverCacheKeys()) {
      if (!merged.includes(k)) merged.push(k);
    }
    const next = merged.slice(0, MAX_CACHED_TILES);
    const evicted = merged.filter((k) => !next.includes(k));
    for (const k of evicted) localStorage.removeItem(k);
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(next));
  } catch {
    // best-effort only
  }
}

export function normalizeCachedAlertSeverity(alerts: WeatherAlert): void {
  // Previous versions cached the CSS class in `severity`; map it back to
  // the raw NWS severity so `alertTone` keeps working after upgrade.
  if (!alerts.features) return;
  for (const alert of alerts.features) {
    const s = alert.properties.severity;
    if (s === "pico-background-yellow-100")
      alert.properties.severity = "Severe";
    else if (s === "pico-background-red-500")
      alert.properties.severity = "Extreme";
  }
}

/** Persist the current forecast snapshot for offline fallback. */
export function saveCachedSnapshot(
  latitude: number,
  longitude: number,
  snapshot: Omit<CachedSnapshot, "savedAt">,
): void {
  const key = cacheKey(latitude, longitude);
  const payload = JSON.stringify({
    v: CACHE_VERSION,
    ...snapshot,
    savedAt: new Date().toISOString(),
  });
  try {
    // Merge the stored index with any legacy keys already in storage so
    // pre-index entries are managed, then free space *before* writing.
    const merged = [key, ...readCacheIndex().filter((k) => k !== key)];
    for (const k of discoverCacheKeys()) {
      if (!merged.includes(k)) merged.push(k);
    }
    const next = merged.slice(0, MAX_CACHED_TILES);
    const evicted = merged.filter((k) => !next.includes(k));
    for (const k of evicted) localStorage.removeItem(k);
    try {
      localStorage.setItem(key, payload);
    } catch {
      // Still no room (e.g. legacy entries were large): drop the oldest
      // managed entry and retry once before giving up.
      const fallback = next.filter((k) => k !== key);
      const oldest = fallback[fallback.length - 1];
      if (!oldest) throw new Error("cache full");
      localStorage.removeItem(oldest);
      localStorage.setItem(key, payload);
      next.splice(next.indexOf(oldest), 1);
    }
    localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(next));
  } catch {
    // storage full / private mode — offline fallback just won't exist
  }
}

/** Read a fresh cached snapshot, or null when missing/stale/versioned out. */
export function loadCachedSnapshot(
  latitude: number,
  longitude: number,
): CachedSnapshot | null {
  try {
    const key = cacheKey(latitude, longitude);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as CachedSnapshot & { v?: number };
    if (!data?.savedAt || !data?.point?.properties) return null;
    if (data.v !== CACHE_VERSION) return null;
    if (!data?.gridData?.properties) return null;
    if (Date.now() - Date.parse(data.savedAt) > CACHE_TTL_MS) return null;
    normalizeCachedAlertSeverity(data.alerts ?? { features: [] });
    writeCacheIndex(key);
    return {
      point: data.point,
      alerts: data.alerts ?? { features: [] },
      forecast: data.forecast ?? {},
      gridData: data.gridData ?? {},
      NWSURL: data.NWSURL ?? "",
      savedAt: data.savedAt,
    };
  } catch {
    return null;
  }
}
