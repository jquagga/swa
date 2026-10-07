<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { parseAfdProduct } from "#lib/afd.js";
  import type {
    Chart as ChartInstance,
    ChartConfiguration,
    ChartDataset,
    TooltipItem,
  } from "chart.js";
  import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";

  // Chart.js is lazy-loaded on first chart render so the Weather page's
  // initial JS stays small. Registered once, then reused.
  let chartLib: typeof import("chart.js") | null = null;
  async function ensureChartLib(): Promise<typeof import("chart.js")> {
    if (!chartLib) {
      const mod = await import("chart.js");
      mod.Chart.register(
        mod.LineController,
        mod.LineElement,
        mod.BarController,
        mod.BarElement,
        mod.PointElement,
        mod.LinearScale,
        mod.CategoryScale,
        mod.Tooltip,
        mod.Legend,
        mod.Filler,
      );
      chartLib = mod;
    }
    return chartLib;
  }

  interface WeatherPoint {
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

  interface WeatherAlert {
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

  interface WeatherPeriod {
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

  interface ForecastData {
    properties?: {
      periods: WeatherPeriod[];
    };
  }

  interface GridValueEntry {
    validTime: string;
    value: number | null;
  }

  interface GridQuantLayer {
    uom: string;
    values: GridValueEntry[];
  }

  interface GridpointProperties {
    temperature?: GridQuantLayer;
    heatIndex?: GridQuantLayer;
    windChill?: GridQuantLayer;
    relativeHumidity?: GridQuantLayer;
    probabilityOfPrecipitation?: GridQuantLayer;
    windSpeed?: GridQuantLayer;
    [key: string]: unknown;
  }

  interface GridpointData {
    properties?: GridpointProperties;
  }

  interface AfdProduct {
    issuanceTime?: string;
    productName?: string;
    productText?: string;
  }

  type ChartData = {
    labels: string[];
    isos: string[];
    tempValues: number[];
    heatIndexValues: (number | null)[];
    windChillValues: (number | null)[];
    popValues: number[];
    windLabels: string[];
    humidityValues: number[];
  };

  // ChartDataset plus the custom `unit`/`isos` fields used for tooltips.
  // `winds`/`humidities` feed the tooltip footer without extra lookups.
  type UnitLineDataset = ChartDataset<"line", number[]> & {
    unit?: string;
    isos?: string[];
    winds?: string[];
    humidities?: number[];
  };

  type UnitBarDataset = ChartDataset<"bar", number[]> & {
    unit?: string;
    isos?: string[];
    winds?: string[];
    humidities?: number[];
  };

  let point = $state.raw<WeatherPoint>({});
  let alerts = $state.raw<WeatherAlert>({ features: [] });
  let forecast = $state.raw<ForecastData>({});
  let gridData = $state.raw<GridpointData>({});
  let NWSURL = $state("");
  let afd = $state.raw<AfdProduct | null>(null);
  // Office with an in-flight AFD request; at most one request per office is
  // ever started (see loadAfd).
  let afdLoadingOffice = $state<string | null>(null);
  let afdLoading = $derived(afdLoadingOffice !== null);
  let afdError = $state<string | null>(null);
  let afdFetchedOffice = $state<string | null>(null);
  // User-visible open state of the AFD accordion, tracked so an office
  // change while it is open can restore it and load the new discussion
  // (a remounted <details> emits no toggle event on its own).
  let afdOpen = $state(false);
  let afdDetailsEl: HTMLDetailsElement | null = $state(null);
  let geolocationError = $state<string | null>(null);
  let isLoading = $state(true);
  let isOffline = $state(false);
  let offlineSavedAt = $state<string | null>(null);
  let hourlyForecastProcessed = $state(false);
  let maplibreglModule: typeof import("maplibre-gl") | null = null;
  let fetchedAt: string | null = $state(null);
  let showRadar = $state(true);
  let showWatchWarn = $state(true);
  let mapReady = $state(false);
  let mapError: string | null = $state(null);
  let mapInstanceRef: import("maplibre-gl").Map | null = null;
  // Monotonic identity for map attachments. Navigation remounts the map
  // via {#key mapKey} while an older init may still be pending; the stale
  // attachment must never write shared map state or clear the new map's ref.
  let mapAttachmentSeq = 0;
  // Monotonic identity for the active coordinate load. Async weather/alert
  // continuations must compare against it and drop stale results so an
  // older request can never overwrite a newer location's state or cache.
  let weatherRequestId = 0;

  const MAX_RETRIES = 3;
  const GRAPH_HOURS = 25;
  const USER_AGENT = "https://github.com/jquagga/swa";
  const CACHE_TTL_MS = 60 * 60 * 1000;
  const MAX_CACHED_TILES = 10;
  const CACHE_INDEX_KEY = "swa:weather:index";
  const CACHE_KEY_PREFIX = "swa:weather:";
  const CACHE_VERSION = 2;

  const DATASET_CONFIG = {
    TEMPERATURE: {
      unit: "°F",
      defaultPointRadius: 3,
    },
    HEAT_INDEX: {
      unit: "°F",
      defaultPointRadius: 3,
    },
    WIND_CHILL: {
      unit: "°F",
      defaultPointRadius: 3,
    },
    PRECIPITATION: {
      unit: "%",
      defaultPointRadius: 2,
    },
  } as const;

  const tooltipTitleFmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const hourLabelFmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    weekday: "short",
  });
  const sunTimeFmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  // Format sun times in the forecast location's timezone (from /points),
  // falling back to the device timezone when it is missing or invalid.
  let sunTimeFormatter = $derived.by(() => {
    const tz = point.properties?.timeZone?.trim();
    if (tz) {
      try {
        return new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: tz,
        });
      } catch {
        // Unknown timezone — fall through to the device default below.
      }
    }
    return sunTimeFmt;
  });

  function formatSunTime(
    iso: string | undefined,
    formatter: Intl.DateTimeFormat,
  ): string | null {
    if (!iso) return null;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return null;
    try {
      return formatter.format(new Date(ms));
    } catch {
      return null;
    }
  }

  function formatIso(iso: string): string {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return iso;
    try {
      return tooltipTitleFmt.format(new Date(ms));
    } catch {
      return iso;
    }
  }

  let locationDisplay = $derived.by(() => {
    if (geolocationError) {
      return geolocationError;
    } else if (point.detail) {
      return `The weather.gov API has returned an error: ${point.detail}`;
    } else if (point.properties?.relativeLocation?.properties) {
      return `${point.properties.relativeLocation.properties.city}, ${point.properties.relativeLocation.properties.state}`;
    } else if (isLoading) {
      return "Loading weather data...";
    } else {
      return "No weather data available";
    }
  });

  let showLoading = $derived(isLoading && !point.properties);

  // Re-evaluated clock so the "next" sun event flips over at sunrise /
  // sunset even on long-open pages (tick only recomputes cheap deriveds).
  let nowMs = $state(Date.now());

  // Only the next sun event: sunrise while it is still upcoming, otherwise
  // today's sunset while the sun is up. After sunset the next sunrise is
  // tomorrow's, which the points response doesn't include, so nothing shows
  // rather than a stale time.
  let nextSunEvent = $derived.by(() => {
    const astro = point.properties?.astronomicalData;
    if (!astro) return null;
    const formatter = sunTimeFormatter;
    const now = nowMs;
    const sunriseMs = astro.sunrise ? Date.parse(astro.sunrise) : NaN;
    const sunsetMs = astro.sunset ? Date.parse(astro.sunset) : NaN;
    if (Number.isFinite(sunriseMs) && now < sunriseMs) {
      const time = formatSunTime(astro.sunrise, formatter);
      return time ? { kind: "rise" as const, time } : null;
    }
    if (Number.isFinite(sunsetMs) && now < sunsetMs) {
      const time = formatSunTime(astro.sunset, formatter);
      return time ? { kind: "set" as const, time } : null;
    }
    return null;
  });

  // WFO identifier (e.g. "TOP") driving the AFD product location and the
  // office briefing download. Prefer `cwa`, fall back to the trailing
  // segment of the forecastOffice URL.
  let officeId = $derived.by(() => {
    const cwa = point.properties?.cwa?.trim();
    if (cwa) return cwa.toUpperCase();
    const url = point.properties?.forecastOffice;
    if (url) {
      const id = url.split("/").filter(Boolean).pop();
      if (id) return id.toUpperCase();
    }
    return null;
  });

  let briefingUrl = $derived(
    officeId
      ? `https://api.weather.gov/offices/${officeId}/briefing/download/latest`
      : null,
  );

  // Parsed AFD blocks (paragraphs / lists / dividers) for readable rendering.
  let afdBlocks = $derived(
    afd?.productText ? parseAfdProduct(afd.productText) : [],
  );

  async function getMapLibreModule(): Promise<typeof import("maplibre-gl")> {
    if (!maplibreglModule) {
      await import("maplibre-gl/dist/maplibre-gl.css");
      const module = await import("maplibre-gl");
      module.setWorkerUrl(workerUrl);
      maplibreglModule = module;
    }

    const maplibre = maplibreglModule;
    if (!maplibre) {
      throw new Error("maplibre-gl module failed to load");
    }

    return maplibre;
  }

  function formatTooltipTitle(
    context: TooltipItem<"line">[] | TooltipItem<"bar">[],
  ): string {
    try {
      if (!context || context.length === 0) {
        return "No data available";
      }
      const idx = context[0].dataIndex;
      const iso = (context[0].dataset as unknown as { isos?: string[] }).isos?.[
        idx
      ];
      if (iso) return formatIso(iso);
      if (context[0].label) return formatIso(context[0].label);
      return "Invalid date";
    } catch {
      return context?.[0]?.label ?? "Date error";
    }
  }

  function formatTooltipLabel(
    context: TooltipItem<"line"> | TooltipItem<"bar">,
  ): string {
    try {
      let label = context.dataset.label || "";
      if (label) {
        label += ": ";
      }

      const unit = (context.dataset as { unit?: string }).unit || "";
      label += context.parsed.y + unit;
      return label;
    } catch {
      return "Data error";
    }
  }

  function formatTooltipFooter(
    context: TooltipItem<"line">[] | TooltipItem<"bar">[],
  ): string {
    try {
      if (!context || context.length === 0) return "";
      const idx = context[0].dataIndex;
      const ds = context[0].dataset as unknown as {
        winds?: string[];
        humidities?: number[];
      };
      const wind = ds.winds?.[idx];
      const humidity = ds.humidities?.[idx];
      const parts: string[] = [];
      if (wind) parts.push(`Wind ${wind}`);
      if (typeof humidity === "number") parts.push(`Humidity ${humidity}%`);
      return parts.join(" • ");
    } catch {
      return "";
    }
  }

  function getPointRadius(baseRadius: number, dataLength: number): number {
    if (dataLength > 20) {
      return Math.max(1, baseRadius - 1);
    }
    return baseRadius;
  }

  const weatherEmojiMap: Record<string, string> = {
    snow: "❄️",
    freezing: "🧊",
    sleet: "🧊",
    thunder: "⛈️",
    rain: "🌧️",
    "partly cloudy": "🌥️",
    "mostly cloudy": "🌥️",
    "partly sunny": "🌤️",
    "mostly sunny": "🌤️",
    sunny: "☀️",
    cloudy: "☁️",
    fog: "🌫️",
    clear: "🌕",
  };

  async function fetchData<T>(url: string): Promise<T> {
    const headers = {
      accept: "application/geo+json",
      "user-agent": USER_AGENT,
    };

    let retryCount = 0;
    let lastError: Error | null = null;

    while (retryCount < MAX_RETRIES) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = (await response.json()) as T;

        return data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount++;

        if (retryCount >= MAX_RETRIES) {
          break;
        }

        const baseDelay = 1000 * Math.pow(2, retryCount);
        const jitter = Math.random() * 0.3 * baseDelay;
        const delay = baseDelay + jitter;

        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error("Unknown error occurred during fetch");
  }

  function cacheKey(latitude: number, longitude: number): string {
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

  function promoteCacheKey(key: string): void {
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

  function saveCached(latitude: number, longitude: number): void {
    const key = cacheKey(latitude, longitude);
    const payload = JSON.stringify({
      v: CACHE_VERSION,
      point,
      alerts,
      forecast,
      gridData,
      NWSURL,
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

  function normalizeCachedAlertSeverity(alerts: WeatherAlert): void {
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

  function loadCached(
    latitude: number,
    longitude: number,
  ): { savedAt: string } | null {
    try {
      const key = cacheKey(latitude, longitude);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const data = JSON.parse(raw) as {
        v?: number;
        point: WeatherPoint;
        alerts: WeatherAlert;
        forecast: ForecastData;
        gridData: GridpointData;
        NWSURL: string;
        savedAt: string;
      };
      if (!data?.savedAt || !data?.point?.properties) return null;
      if (data.v !== CACHE_VERSION) return null;
      if (!data?.gridData?.properties) return null;
      if (Date.now() - Date.parse(data.savedAt) > CACHE_TTL_MS) return null;
      normalizeCachedAlertSeverity(data.alerts ?? { features: [] });
      point = data.point;
      alerts = data.alerts ?? { features: [] };
      forecast = data.forecast ?? {};
      gridData = data.gridData ?? {};
      NWSURL = data.NWSURL ?? "";
      hourlyForecastProcessed = true;
      isOffline = true;
      offlineSavedAt = data.savedAt;
      fetchedAt = data.savedAt;
      updateBadge();
      promoteCacheKey(key);
      return { savedAt: data.savedAt };
    } catch {
      return null;
    }
  }

  function updateBadge(): void {
    try {
      const nav = navigator as Navigator & {
        setAppBadge?: (n: number) => Promise<void>;
        clearAppBadge?: () => Promise<void>;
      };
      const count = alerts.features?.length ?? 0;
      if (count > 0) {
        nav.setAppBadge?.(count);
      } else {
        nav.clearAppBadge?.();
      }
    } catch {
      // Badging is best-effort
    }
  }

  function alertTone(severity: string): string {
    // Legacy cache compat: previous versions stored the CSS class.
    switch (severity) {
      case "Severe":
      case "pico-background-yellow-100":
        return "swa-alert-severe";
      case "Extreme":
      case "pico-background-red-500":
        return "swa-alert-extreme";
      case "Moderate":
        return "swa-alert-moderate";
      case "Minor":
        return "swa-alert-minor";
      default:
        return "swa-alert-unknown";
    }
  }

  function alertSeverityLabel(severity: string): string {
    switch (severity) {
      case "pico-background-yellow-100":
        return "Severe";
      case "pico-background-red-500":
        return "Extreme";
      case "Extreme":
      case "Severe":
      case "Moderate":
      case "Minor":
      case "Unknown":
        return severity;
      default:
        return severity || "Unknown";
    }
  }

  function mapWeatherToEmoji(description: string): string {
    const lowerDesc = description.toLowerCase();
    for (const [key, emoji] of Object.entries(weatherEmojiMap)) {
      if (lowerDesc.includes(key)) {
        return emoji;
      }
    }
    return description;
  }

  function celsiusToFahrenheit(celsius: number): number {
    return (celsius * 9) / 5 + 32;
  }

  function convertGridTemperature(value: number | null, uom: string): number | null {
    if (value == null) return null;
    // Gridpoint temps arrive as wmoUnit:degC; pass through if already F.
    if (uom.includes("degF") || uom === "F") return value;
    return celsiusToFahrenheit(value);
  }

  function convertGridWindSpeed(value: number | null, uom: string): number | null {
    if (value == null) return null;
    if (uom.includes("km_h") || uom.includes("km/h")) return value * 0.621371;
    if (uom.includes("m_s") || uom.includes("m/s")) return value * 2.23694;
    return value;
  }

  interface GridInterval {
    startMs: number;
    endMs: number;
    value: number | null;
  }

  function parseIsoDurationMs(duration: string): number | null {
    // Supports the NWS subset: PnD / PTnH / PTnM / PnDTnHnM.
    const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(duration);
    if (!match) return null;
    const days = Number(match[1] ?? 0);
    const hours = Number(match[2] ?? 0);
    const minutes = Number(match[3] ?? 0);
    if (!days && !hours && !minutes) return null;
    return ((days * 24 + hours) * 60 + minutes) * 60 * 1000;
  }

  function parseValidTime(validTime: string): { startMs: number; endMs: number } | null {
    const parts = validTime.split("/");
    if (parts.length !== 2) return null;
    const startMs = Date.parse(parts[0]);
    if (!Number.isFinite(startMs)) return null;
    let endMs: number;
    if (parts[1].startsWith("P")) {
      const durationMs = parseIsoDurationMs(parts[1]);
      if (durationMs == null) return null;
      endMs = startMs + durationMs;
    } else {
      endMs = Date.parse(parts[1]);
      if (!Number.isFinite(endMs)) return null;
    }
    if (!(endMs > startMs)) return null;
    return { startMs, endMs };
  }

  function expandLayerIntervals(layer: GridQuantLayer | undefined): GridInterval[] {
    if (!layer?.values) return [];
    const intervals: GridInterval[] = [];
    for (const entry of layer.values) {
      const parsed = parseValidTime(entry.validTime);
      if (!parsed) continue;
      intervals.push({ ...parsed, value: entry.value });
    }
    intervals.sort((a, b) => a.startMs - b.startMs);
    return intervals;
  }

  function lookupIntervalValue(intervals: GridInterval[], slotStartMs: number): number | null {
    for (const interval of intervals) {
      if (slotStartMs < interval.startMs) break;
      if (slotStartMs < interval.endMs) return interval.value;
    }
    return null;
  }

  let hourlyChartData = $derived.by((): ChartData => {
    const empty: ChartData = {
      labels: [],
      isos: [],
      tempValues: [],
      heatIndexValues: [],
      windChillValues: [],
      popValues: [],
      windLabels: [],
      humidityValues: [],
    };
    const props = gridData.properties;
    const tempLayer = props?.temperature;
    if (!tempLayer) return empty;

    const tempIntervals = expandLayerIntervals(tempLayer);
    const heatIntervals = expandLayerIntervals(props?.heatIndex);
    const chillIntervals = expandLayerIntervals(props?.windChill);
    const popIntervals = expandLayerIntervals(props?.probabilityOfPrecipitation);
    const humidityIntervals = expandLayerIntervals(props?.relativeHumidity);
    const windIntervals = expandLayerIntervals(props?.windSpeed);
    const HOUR_MS = 60 * 60 * 1000;

    const labels: string[] = [];
    const isos: string[] = [];
    const tempValues: number[] = [];
    const heatIndexValues: (number | null)[] = [];
    const windChillValues: (number | null)[] = [];
    const popValues: number[] = [];
    const windLabels: string[] = [];
    const humidityValues: number[] = [];

    const nowMs = Date.now();
    const tempUom = tempLayer.uom ?? "";
    const heatUom = props?.heatIndex?.uom ?? "";
    const chillUom = props?.windChill?.uom ?? "";
    const windUom = props?.windSpeed?.uom ?? "";

    // Temperature intervals are step functions held constant over
    // validTime; split multi-hour intervals into hourly slots, then look
    // up the covering value in each companion layer per slot.
    for (const interval of tempIntervals) {
      for (
        let slotStart = interval.startMs;
        slotStart < interval.endMs && labels.length < GRAPH_HOURS;
        slotStart += HOUR_MS
      ) {
        const slotEnd = slotStart + HOUR_MS;
        if (nowMs >= slotEnd) continue;
        if (interval.value == null) continue;
        const tempF = convertGridTemperature(interval.value, tempUom);
        if (tempF == null) continue;
        const rawHeat = lookupIntervalValue(heatIntervals, slotStart);
        const rawChill = lookupIntervalValue(chillIntervals, slotStart);
        const heatF =
          rawHeat == null
            ? null
            : convertGridTemperature(rawHeat, heatUom);
        const chillF =
          rawChill == null
            ? null
            : convertGridTemperature(rawChill, chillUom);
        const pop = lookupIntervalValue(popIntervals, slotStart) ?? 0;
        const humidity = lookupIntervalValue(humidityIntervals, slotStart) ?? 0;
        const rawWind = lookupIntervalValue(windIntervals, slotStart);
        const windMph =
          rawWind == null ? null : convertGridWindSpeed(rawWind, windUom);
        const date = new Date(slotStart);
        labels.push(hourLabelFmt.format(date));
        isos.push(date.toISOString());
        tempValues.push(Math.round(tempF));
        heatIndexValues.push(heatF == null ? null : Math.round(heatF));
        windChillValues.push(chillF == null ? null : Math.round(chillF));
        popValues.push(Math.round(pop));
        windLabels.push(
          windMph == null ? "—" : `${Math.round(windMph)} mph`,
        );
        humidityValues.push(Math.round(humidity));
      }
      if (labels.length >= GRAPH_HOURS) break;
    }

    return {
      labels,
      isos,
      tempValues,
      heatIndexValues,
      windChillValues,
      popValues,
      windLabels,
      humidityValues,
    };
  });

  let chartReady = $derived(
    hourlyForecastProcessed && hourlyChartData.labels.length > 0,
  );

  let hourlyHigh = $derived(
    hourlyChartData.tempValues.length > 0
      ? Math.max(...hourlyChartData.tempValues)
      : null,
  );
  let hourlyLow = $derived(
    hourlyChartData.tempValues.length > 0
      ? Math.min(...hourlyChartData.tempValues)
      : null,
  );

  let currentHero = $derived.by(() => {
    const daily = forecast.properties?.periods?.[0];
    const hasHourly = hourlyChartData.tempValues.length > 0;
    if (!hasHourly && !daily) return null;
    const heatIndex = hasHourly ? (hourlyChartData.heatIndexValues[0] ?? null) : null;
    const windChill = hasHourly ? (hourlyChartData.windChillValues[0] ?? null) : null;
    return {
      temperature: hasHourly ? hourlyChartData.tempValues[0] : (daily?.temperature ?? 0),
      temperatureUnit: "F",
      heatIndex,
      windChill,
      shortForecast: daily?.shortForecast ?? "",
      windSpeed: hasHourly ? hourlyChartData.windLabels[0] : (daily?.windSpeed ?? "—"),
      humidity: hasHourly ? hourlyChartData.humidityValues[0] : (daily?.relativeHumidity.value ?? null),
      pop: hasHourly ? hourlyChartData.popValues[0] : (daily?.probabilityOfPrecipitation?.value ?? null),
      isDaytime: daily?.isDaytime ?? true,
      dailyName: daily?.name ?? null,
      dailyHighLow: daily
        ? `${daily.isDaytime ? "High" : "Low"} ${daily.temperature}°`
        : null,
    };
  });

  async function refreshForecast(): Promise<void> {
    const parsed = parseCoords();
    if (!parsed.ok) return;
    const requestId = ++weatherRequestId;
    // Same coordinates: the {#key mapKey} attachment is not remounted, so
    // preserve the working radar instead of covering it with the loading
    // placeholder that clearLocationState would otherwise re-arm.
    const prevMapReady = mapReady;
    const prevMapError = mapError;
    clearLocationState();
    mapReady = prevMapReady;
    mapError = prevMapError;
    geolocationError = null;
    isLoading = true;
    try {
      await processWeather(parsed.latitude, parsed.longitude, requestId);
    } catch (error) {
      // A newer location request may have started while the refresh was
      // pending; never let this stale failure overwrite its data, error,
      // or loading state.
      if (!isCurrentRequest(requestId)) return;
      console.error("Error refreshing weather data:", error);
      const cached = loadCached(parsed.latitude, parsed.longitude);
      if (!cached) {
        geolocationError = "Unable to refresh weather data. Please try again.";
      }
      isLoading = false;
    }
  }

  function buildChartConfig(chartData: ChartData): ChartConfiguration {
    const tempPointRadius = getPointRadius(
      DATASET_CONFIG.TEMPERATURE.defaultPointRadius,
      chartData.labels.length,
    );
    const heatPointRadius = getPointRadius(
      DATASET_CONFIG.HEAT_INDEX.defaultPointRadius,
      chartData.labels.length,
    );
    const chillPointRadius = getPointRadius(
      DATASET_CONFIG.WIND_CHILL.defaultPointRadius,
      chartData.labels.length,
    );
    // Neutral grid works in both light and dark mode (previous
    // rgba(0,0,0,0.05) was invisible in dark mode).
    const gridColor = "rgba(127, 127, 127, 0.25)";

    const tempDataset: UnitLineDataset = {
      type: "line" as const,
      label: "Temperature",
      data: chartData.tempValues,
      borderColor: "#B42318",
      backgroundColor: "rgba(180, 35, 24, 0.08)",
      tension: 0.4,
      yAxisID: "y",
      pointRadius: tempPointRadius,
      pointHoverRadius: tempPointRadius + 3,
      pointBackgroundColor: "#B42318",
      pointBorderColor: "#B42318",
      pointBorderWidth: 1,
      borderWidth: 2.5,
      unit: DATASET_CONFIG.TEMPERATURE.unit,
      isos: chartData.isos,
      winds: chartData.windLabels,
      humidities: chartData.humidityValues,
    };
    const feelsDatasets: UnitLineDataset[] = [];
    if (chartData.heatIndexValues.some((v) => v != null)) {
      feelsDatasets.push({
        type: "line" as const,
        label: "Heat Index",
        data: chartData.heatIndexValues as number[],
        borderColor: "#C2410C",
        backgroundColor: "transparent",
        borderDash: [6, 4],
        tension: 0.4,
        yAxisID: "y",
        pointRadius: heatPointRadius,
        pointHoverRadius: heatPointRadius + 3,
        pointBackgroundColor: "#C2410C",
        pointBorderColor: "#C2410C",
        pointBorderWidth: 1,
        pointStyle: "rectRot",
        borderWidth: 2,
        spanGaps: false,
        unit: DATASET_CONFIG.HEAT_INDEX.unit,
        isos: chartData.isos,
        winds: chartData.windLabels,
        humidities: chartData.humidityValues,
      });
    }
    if (chartData.windChillValues.some((v) => v != null)) {
      feelsDatasets.push({
        type: "line" as const,
        label: "Wind Chill",
        data: chartData.windChillValues as number[],
        borderColor: "#017FC0",
        backgroundColor: "transparent",
        borderDash: [6, 4],
        tension: 0.4,
        yAxisID: "y",
        pointRadius: chillPointRadius,
        pointHoverRadius: chillPointRadius + 3,
        pointBackgroundColor: "#017FC0",
        pointBorderColor: "#017FC0",
        pointBorderWidth: 1,
        pointStyle: "rectRot",
        borderWidth: 2,
        spanGaps: false,
        unit: DATASET_CONFIG.WIND_CHILL.unit,
        isos: chartData.isos,
        winds: chartData.windLabels,
        humidities: chartData.humidityValues,
      });
    }
    const popDataset: UnitBarDataset = {
      type: "bar" as const,
      label: "Chance of Precipitation",
      data: chartData.popValues,
      backgroundColor: "rgba(1, 127, 192, 0.45)",
      hoverBackgroundColor: "rgba(1, 127, 192, 0.65)",
      borderColor: "rgba(1, 127, 192, 0.9)",
      borderWidth: 1,
      borderRadius: 3,
      yAxisID: "y1",
      barPercentage: 0.6,
      categoryPercentage: 0.7,
      unit: DATASET_CONFIG.PRECIPITATION.unit,
      isos: chartData.isos,
      winds: chartData.windLabels,
      humidities: chartData.humidityValues,
    };

    return {
      type: "bar" as const,
      data: {
        labels: chartData.labels,
        datasets: [
          tempDataset as never,
          ...(feelsDatasets as never[]),
          popDataset as never,
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 0,
        },
        interaction: {
          mode: "index" as const,
          intersect: false,
        },
        scales: {
          x: {
            type: "category",
            stacked: false,
            grid: {
              display: true,
              color: gridColor,
            },
            ticks: {
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 9,
              autoSkipPadding: 10,
            },
          },
          y: {
            type: "linear",
            beginAtZero: false,
            grace: "5%",
            ticks: {
              callback: function (value: string | number) {
                return String(value) + "°";
              },
              padding: 8,
              maxTicksLimit: 6,
            },
            grid: {
              display: true,
              color: gridColor,
            },
            title: {
              display: false,
            },
          },
          y1: {
            type: "linear",
            display: true,
            position: "right" as const,
            min: 0,
            max: 100,
            ticks: {
              callback: function (value: string | number) {
                return String(value) + "%";
              },
              maxTicksLimit: 5,
            },
            grid: {
              display: false,
            },
          },
        },
        plugins: {
          legend: {
            display: true,
            position: "bottom" as const,
            align: "center" as const,
            labels: {
              usePointStyle: true,
              padding: 20,
              boxWidth: 8,
            },
          },
          tooltip: {
            backgroundColor: "rgba(0, 0, 0, 0.85)",
            titleColor: "#fff",
            bodyColor: "#fff",
            footerColor: "#cbd5e1",
            padding: 12,
            displayColors: true,
            callbacks: {
              title: formatTooltipTitle as never,
              label: formatTooltipLabel as never,
              footer: formatTooltipFooter as never,
            },
          },
        },
        elements: {
          line: {
            borderJoinStyle: "round" as const,
          },
        },
      },
    };
  }

  function chartAttachment(canvas: HTMLCanvasElement) {
    let instance: ChartInstance | null = null;
    let destroyed = false;

    async function init() {
      try {
        const lib = await ensureChartLib();
        if (destroyed) return;
        instance = new lib.Chart(canvas, buildChartConfig(hourlyChartData));
      } catch (e) {
        console.error(e);
      }
    }

    void init();

    $effect(() => {
      // Read hourlyChartData unconditionally so this effect subscribes to it
      // even on runs before `instance` exists; otherwise late forecast
      // updates would never rerun the effect and the chart would go stale.
      // The dataset list is dynamic (heat index / wind chill appear only
      // when NWS provides them), so sync the full config each run.
      const data = hourlyChartData;
      if (instance) {
        const next = buildChartConfig(data);
        instance.data.labels = next.data.labels;
        instance.data.datasets = next.data.datasets;
        instance.update("none");
      }
    });

    return () => {
      destroyed = true;
      instance?.destroy();
      instance = null;
    };
  }

  // Derived from the URL only (not from loaded point data) so the map can
  // mount in parallel with the forecast and be keyed/recreated per location.
  let mapCoords = $derived.by(() => {
    const latStr = page.url.searchParams.get("lat");
    const lonStr = page.url.searchParams.get("lon");
    if (!latStr?.trim() || !lonStr?.trim()) return null;
    const lat = Number(latStr);
    const lon = Number(lonStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  });

  let mapKey = $derived(
    mapCoords ? `${mapCoords.lat.toFixed(4)},${mapCoords.lon.toFixed(4)}` : "",
  );

  function mapAttachment(container: HTMLElement) {
    const coords = mapCoords;
    if (!coords) return () => {};
    const { lat: latitude, lon: longitude } = coords;
    const attachmentId = ++mapAttachmentSeq;
    let loaded = false;
    function isCurrentAttachment(): boolean {
      return !destroyed && attachmentId === mapAttachmentSeq;
    }
    let mapInstance: import("maplibre-gl").Map | null = null;
    let markerInstance: import("maplibre-gl").Marker | null = null;
    let destroyed = false;
    let observer: IntersectionObserver | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    // NWS radar tiles update every ~5 min; bust the tile cache on the same
    // cadence so the map never sits on a stale sweep.
    const RADAR_REFRESH_MS = 5 * 60 * 1000;
    const RADAR_BASE =
      "https://mapservices.weather.noaa.gov/eventdriven/services/radar/radar_base_reflectivity/MapServer/WMSServer?bbox={bbox-epsg-3857}&format=image/png&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&transparent=true&styles=default&width=256&height=256&layers=1";
    const WATCH_WARN_BASE =
      "https://mapservices.weather.noaa.gov/eventdriven/services/WWA/watch_warn_adv/MapServer/WMSServer?bbox={bbox-epsg-3857}&format=image/png&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&transparent=true&styles=default&width=256&height=256&layers=1";

    function wmsTiles(base: string): [string] {
      return [`${base}&_ts=${Math.floor(Date.now() / RADAR_REFRESH_MS)}`];
    }

    function getStyle() {
      return mediaQuery.matches
        ? "https://tiles.openfreemap.org/styles/dark"
        : "https://tiles.openfreemap.org/styles/positron";
    }

    // setStyle() drops all custom sources/layers, so (re-)adding must be
    // idempotent and run after every style load, not just the first one.
    function ensureNwsOverlays(): void {
      const map = mapInstance;
      if (!map || destroyed || !map.isStyleLoaded()) return;
      if (!map.getSource("nws_radar")) {
        map.addSource("nws_radar", {
          type: "raster",
          tiles: wmsTiles(RADAR_BASE),
          tileSize: 256,
          maxzoom: 12,
          attribution: "NOAA NWS radar",
        });
      }
      if (!map.getSource("nws_watch_warn")) {
        map.addSource("nws_watch_warn", {
          type: "raster",
          tiles: wmsTiles(WATCH_WARN_BASE),
          tileSize: 256,
          maxzoom: 12,
          attribution: "NOAA NWS alerts",
        });
      }
      if (!map.getLayer("nws_radar")) {
        map.addLayer({
          id: "nws_radar",
          type: "raster",
          source: "nws_radar",
          paint: {
            "raster-opacity": 0.85,
            "raster-fade-duration": 0,
          },
        });
      }
      if (!map.getLayer("nws_watch_warn")) {
        map.addLayer({
          id: "nws_watch_warn",
          type: "raster",
          source: "nws_watch_warn",
          paint: {
            "raster-opacity": 0.9,
            "raster-fade-duration": 0,
          },
        });
      }
      applyOverlayVisibility();
    }

    function applyOverlayVisibility(): void {
      const map = mapInstance;
      if (!map || destroyed) return;
      try {
        if (map.getLayer("nws_radar")) {
          map.setLayoutProperty(
            "nws_radar",
            "visibility",
            showRadar ? "visible" : "none",
          );
        }
        if (map.getLayer("nws_watch_warn")) {
          map.setLayoutProperty(
            "nws_watch_warn",
            "visibility",
            showWatchWarn ? "visible" : "none",
          );
        }
      } catch (e) {
        console.warn("Overlay toggle failed:", e);
      }
    }

    function refreshRadarTiles(): void {
      const map = mapInstance;
      if (!map || destroyed) return;
      try {
        for (const [id, base] of [
          ["nws_radar", RADAR_BASE],
          ["nws_watch_warn", WATCH_WARN_BASE],
        ] as const) {
          const source = map.getSource(id);
          if (
            source &&
            typeof (source as { setTiles?: unknown }).setTiles === "function"
          ) {
            (source as unknown as { setTiles: (t: string[]) => void }).setTiles(
              wmsTiles(base),
            );
          }
        }
      } catch (e) {
        console.warn("Radar refresh failed:", e);
      }
    }

    function handleStyleChange() {
      if (mapInstance && !destroyed) {
        mapInstance.setStyle(getStyle());
        // ensureNwsOverlays runs again on the resulting styledata event.
      }
    }

    async function initMap() {
      try {
        const maplibregl = await getMapLibreModule();
        if (!isCurrentAttachment()) return;

        mapInstance = new maplibregl.Map({
          container,
          style: getStyle(),
          center: [longitude, latitude],
          zoom: 7,
          minZoom: 3,
          maxZoom: 12,
          // 2D radar: no pitch/rotate keeps rendering cheap and north-up.
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          // Embedded in a scrollable page: require ctrl/cmd-scroll or
          // two-finger drag so normal scrolling still works, with zoom
          // buttons as the discoverable alternative.
          cooperativeGestures: true,
          attributionControl: { compact: true },
          fadeDuration: 0,
          crossSourceCollisions: false,
          renderWorldCopies: false,
        });

        markerInstance = new maplibregl.Marker({ color: "#017FC0" })
          .setLngLat([longitude, latitude])
          .addTo(mapInstance);

        mapInstance.addControl(
          new maplibregl.NavigationControl({ visualizePitch: false }),
          "top-right",
        );

        mapInstance.on("load", () => {
          if (!isCurrentAttachment()) return;
          loaded = true;
          ensureNwsOverlays();
          mapReady = true;
          mapInstanceRef = mapInstance;
        });
        // Fires after every setStyle() (e.g. dark-mode toggle).
        mapInstance.on("styledata", ensureNwsOverlays);
        mapInstance.on("error", (e) => {
          console.warn("Map error:", e.error ?? e);
          // Surface failures that happen before first load (bad style URL,
          // blocked tiles) instead of leaving the loading placeholder up.
          // Post-load tile errors stay log-only so transient blips don't
          // wipe out a working map.
          if (isCurrentAttachment() && !loaded) {
            mapError =
              "Radar map failed to load. Your forecast above is still current.";
          }
        });
        mapInstanceRef = mapInstance;

        refreshTimer = setInterval(refreshRadarTiles, RADAR_REFRESH_MS);
      } catch (e) {
        if (!isCurrentAttachment()) return;
        console.error(e);
        mapError =
          "Radar map failed to load. Your forecast above is still current.";
      }
    }

    mediaQuery.addEventListener("change", handleStyleChange);

    // Defer the ~800KB map stack until the user scrolls near it.
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            observer?.disconnect();
            observer = null;
            void initMap();
          }
        },
        { rootMargin: "400px" },
      );
      observer.observe(container);
    } else {
      void initMap();
    }

    return () => {
      destroyed = true;
      observer?.disconnect();
      mediaQuery.removeEventListener("change", handleStyleChange);
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
      markerInstance?.remove();
      markerInstance = null;
      const ownMap = mapInstance;
      if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
      }
      // Only clear the shared ref if it still points at this attachment's
      // map; a remounted attachment may have already stored its own.
      if (mapInstanceRef === ownMap) {
        mapInstanceRef = null;
      }
    };
  }

  function toggleOverlay(id: "nws_radar" | "nws_watch_warn", visible: boolean) {
    const map = mapInstanceRef;
    if (!map) return;
    try {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      }
    } catch (e) {
      console.warn("Overlay toggle failed:", e);
    }
  }

  $effect(() => {
    toggleOverlay("nws_radar", showRadar);
  });
  $effect(() => {
    toggleOverlay("nws_watch_warn", showWatchWarn);
  });

  $effect(() => {
    const timer = setInterval(() => {
      nowMs = Date.now();
    }, 60_000);
    return () => clearInterval(timer);
  });

  $effect(() => {
    // Load the discussion when the accordion opens, and when the office
    // changes while it is open: navigating remounts the <details> (still
    // open per afdOpen) without emitting a toggle event.
    if (!officeId || !afdOpen) return;
    if (afdDetailsEl && !afdDetailsEl.open) afdDetailsEl.open = true;
    void loadAfd(true);
  });

  function isCurrentRequest(requestId: number): boolean {
    return requestId === weatherRequestId;
  }

  function clearLocationState(): void {
    point = {};
    alerts = { features: [] };
    forecast = {};
    gridData = {};
    NWSURL = "";
    afd = null;
    afdLoadingOffice = null;
    afdError = null;
    afdFetchedOffice = null;
    hourlyForecastProcessed = false;
    isOffline = false;
    offlineSavedAt = null;
    fetchedAt = null;
    mapReady = false;
    mapError = null;
  }

  async function processWeather(
    latitude: number,
    longitude: number,
    requestId: number,
  ): Promise<void> {
    try {
      const pointData = await fetchData<WeatherPoint>(
        `https://api.weather.gov/points/${latitude},${longitude}`,
      );
      if (!isCurrentRequest(requestId)) return;

      if (!pointData.properties) {
        throw new Error("Invalid location data received");
      }
      point = pointData;

      const gridUrl = pointData.properties.forecastGridData;
      const forecastUrl = pointData.properties.forecast;
      if (!gridUrl || !forecastUrl) {
        throw new Error("Invalid location data received");
      }

      const [gridpointData, weeklyForecastData] = await Promise.all([
        fetchData<GridpointData>(gridUrl),
        fetchData<ForecastData>(forecastUrl),
      ]);
      if (!isCurrentRequest(requestId)) return;

      gridData = gridpointData;
      forecast = weeklyForecastData;

      hourlyForecastProcessed = true;
      isOffline = false;
      offlineSavedAt = null;
      fetchedAt = new Date().toISOString();
      geolocationError = null;

      NWSURL = `https://forecast.weather.gov/MapClick.php?lat=${latitude}&lon=${longitude}`;

      // Paint the forecast now; alerts resolve independently so a slow
      // alerts endpoint never delays the forecast or cache.
      saveCached(latitude, longitude);
      void fetchAlertsAsync(latitude, longitude, requestId);
    } catch (error) {
      console.error("Error in processWeather:", error);
      throw error;
    } finally {
      if (isCurrentRequest(requestId)) {
        isLoading = false;
      }
    }
  }

  // Lazily fetch the latest Area Forecast Discussion for this office when
  // the accordion opens. Cached per office so toggling never refetches;
  // a failed load retries on the next open. The requesting office is
  // captured up front and rechecked before committing: a late response
  // from a previous office is dropped, and only one request per office is
  // ever in flight so a failed retry can't hide a loaded discussion.
  async function loadAfd(isOpen: boolean): Promise<void> {
    if (!isOpen || !officeId) return;
    if (afdFetchedOffice === officeId && afd) return;
    if (afdLoadingOffice === officeId) return;
    const requestOffice = officeId;
    afdLoadingOffice = requestOffice;
    afdError = null;
    try {
      const data = await fetchData<AfdProduct>(
        `https://api.weather.gov/products/types/AFD/locations/${requestOffice}/latest`,
      );
      if (officeId !== requestOffice) return;
      afd = data;
      afdFetchedOffice = requestOffice;
    } catch (error) {
      if (officeId !== requestOffice) return;
      console.error("Error fetching AFD:", error);
      afdError =
        "Unable to load the Area Forecast Discussion. Please try again.";
    } finally {
      if (afdLoadingOffice === requestOffice) afdLoadingOffice = null;
    }
  }

  async function fetchAlertsAsync(    latitude: number,
    longitude: number,
    requestId: number,
  ): Promise<void> {
    try {
      const alertsData = await fetchData<WeatherAlert>(
        `https://api.weather.gov/alerts/active?status=actual&message_type=alert,update&point=${latitude},${longitude}`,
      );
      // Drop stale responses and never cache alerts under the wrong tile:
      // only the still-active request may commit and re-save its own tile.
      if (!isCurrentRequest(requestId)) return;
      alerts = alertsData;
      updateBadge();
      saveCached(latitude, longitude);
    } catch (error) {
      console.error("Error fetching alerts:", error);
    }
  }

  function parseCoords():
    | { ok: true; latitude: number; longitude: number }
    | { ok: false; reason: string } {
    const lat = page.url.searchParams.get("lat");
    const lon = page.url.searchParams.get("lon");

    if (!lat?.trim() || !lon?.trim()) {
      return {
        ok: false,
        reason: "No location provided. Please go back and try again.",
      };
    }
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return {
        ok: false,
        reason: "Invalid location coordinates. Please go back and try again.",
      };
    }
    return { ok: true, latitude, longitude };
  }

  $effect(() => {
    // Track only the URL: re-fetch when ?lat/?lon change via client nav.
    const parsed = parseCoords();
    const requestId = ++weatherRequestId;
    let cancelled = false;

    if (!parsed.ok) {
      clearLocationState();
      geolocationError = parsed.reason;
      isLoading = false;
      return;
    }

    const { latitude, longitude } = parsed;
    // A new valid load replaces the previous location: clear stale
    // forecast/alerts and any prior error so old data never persists
    // beside the loading indicator, and clear the error up front so a
    // prior failure can't stick as the heading after success.
    clearLocationState();
    geolocationError = null;
    isLoading = true;

    processWeather(latitude, longitude, requestId).catch((error) => {
      if (cancelled || !isCurrentRequest(requestId)) return;
      console.error("Error processing weather data:", error);
      // Offline-first: fall back to the last cached forecast for this tile.
      const cached = loadCached(latitude, longitude);
      if (cached) {
        geolocationError = null;
        isLoading = false;
        return;
      }
      if (error instanceof Error) {
        if (error.message.includes("HTTP error")) {
          geolocationError =
            "Unable to fetch weather data. The service may be temporarily unavailable.";
        } else if (
          error.message.includes("NetworkError") ||
          error.message.includes("Failed to fetch")
        ) {
          geolocationError =
            "Network error. Please check your internet connection and try again.";
        } else {
          geolocationError = `Error: ${error.message}`;
        }
      } else {
        geolocationError = "Failed to process weather data. Please try again.";
      }
      isLoading = false;
    });

    return () => {
      cancelled = true;
    };
  });
</script>

<svelte:boundary>
  <div class="container-fluid">
    <div class="swa-toolbar">
      <a href="/">← New search</a>
      <span class="spacer"></span>
      <button
        type="button"
        onclick={refreshForecast}
        disabled={isLoading}
        aria-label="Refresh forecast"
      >
        ↻ Refresh
      </button>
    </div>

    <h1>
      {locationDisplay}
    </h1>

    {#if mapCoords}
      <p class="swa-meta">
        {mapCoords.lat.toFixed(4)}, {mapCoords.lon.toFixed(4)}
        {#if fetchedAt}
          • Updated {formatIso(fetchedAt)}
        {/if}
        {#if isOffline}
          • Offline — showing cached forecast
        {/if}
      </p>
    {/if}

    {#if geolocationError}
      <div class="swa-error-box" role="alert">
        <p class="swa-error">{geolocationError}</p>
        <button type="button" onclick={refreshForecast} disabled={isLoading}>
          Try again
        </button>
      </div>
    {/if}

    {#if showLoading}
      <div aria-busy="true" aria-label="Fetching weather data">
        <div class="swa-skeleton swa-skeleton-hero"></div>
        <div class="swa-skeleton swa-skeleton-block"></div>
        <div class="swa-skeleton swa-skeleton-block"></div>
        <div class="swa-skeleton swa-skeleton-block"></div>
      </div>
    {/if}

    {#if currentHero}
      <section class="swa-hero" aria-label="Current conditions">
        <div class="swa-hero-top">
          <span class="swa-hero-icon" aria-hidden="true">
            {mapWeatherToEmoji(currentHero.shortForecast)}
          </span>
          <span class="swa-hero-temp">
            {currentHero.temperature}°{currentHero.temperatureUnit === "°F" ||
            currentHero.temperatureUnit === "F"
              ? ""
              : ` ${currentHero.temperatureUnit}`}
          </span>
          <div>
            <p class="swa-hero-short">{currentHero.shortForecast}</p>
            {#if currentHero.heatIndex !== null}
              <p class="swa-hero-feels">Heat index {currentHero.heatIndex}°</p>
            {:else if currentHero.windChill !== null}
              <p class="swa-hero-feels">Wind chill {currentHero.windChill}°</p>
            {/if}
          </div>
        </div>
        <ul class="swa-chips">
          {#if currentHero.dailyHighLow}
            <li>
              {currentHero.dailyName ?? "Today"}: {currentHero.dailyHighLow}
            </li>
          {/if}
          <li>Wind {currentHero.windSpeed}</li>
          {#if currentHero.humidity !== null}
            <li>Humidity {currentHero.humidity}%</li>
          {/if}
          {#if currentHero.pop !== null}
            <li>Precip {currentHero.pop}%</li>
          {/if}
          {#if nextSunEvent}
            <li>
              {nextSunEvent.kind === "rise" ? "🌅 Sunrise" : "🌇 Sunset"}
              {nextSunEvent.time}
            </li>
          {/if}
        </ul>
      </section>
    {/if}

    <div id="alerts">
      {#if alerts.features?.length}
        <h2>Active alerts ({alerts.features.length})</h2>
        {#each alerts.features as alert (alert.properties.id + "-" + (alert.properties.effective || ""))}
          <details class="swa-alert {alertTone(alert.properties.severity)}">
            <summary>
              {alert.properties.event}
              <span class="swa-alert-severity">
                {alertSeverityLabel(alert.properties.severity)}
              </span>
            </summary>
            <div class="swa-alert-body">
              {#if alert.properties.effective}
                <p class="swa-meta">
                  Effective {formatIso(alert.properties.effective)}
                </p>
              {/if}
              <p>{alert.properties.description}</p>
              {#if alert.properties.instruction}
                <p>
                  <strong>What to do:</strong>
                  {alert.properties.instruction}
                </p>
              {/if}
            </div>
          </details>
        {/each}
      {/if}
    </div>

    {#if chartReady}
      <section aria-labelledby="hourly-heading">
        <h2 id="hourly-heading">Next 24 hours</h2>
        <div class="swa-chart-wrap">
          <canvas
            id="myChart"
            aria-label="Hourly temperature, heat index, wind chill, and chance of precipitation for the next 24 hours"
            {@attach chartAttachment}
          ></canvas>
        </div>
        {#if hourlyHigh !== null && hourlyLow !== null}
          <p class="swa-chart-caption">
            High {hourlyHigh}° • Low {hourlyLow}° • Bars show chance of
            precipitation (right axis).
          </p>
        {/if}
        <details class="swa-hourly-fallback">
          <summary>Hourly data table (accessible alternative)</summary>
          <table class="striped">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Temp</th>
                <th scope="col">Heat index</th>
                <th scope="col">Wind chill</th>
                <th scope="col">Precip</th>
              </tr>
            </thead>
            <tbody>
              {#each hourlyChartData.labels as label, i (hourlyChartData.isos[i] ?? label)}
                <tr>
                  <th scope="row"
                    >{formatIso(hourlyChartData.isos[i] ?? label)}</th
                  >
                  <td>{hourlyChartData.tempValues[i]}°</td>
                  <td>{hourlyChartData.heatIndexValues[i] ?? "—"}{hourlyChartData.heatIndexValues[i] != null ? "°" : ""}</td>
                  <td>{hourlyChartData.windChillValues[i] ?? "—"}{hourlyChartData.windChillValues[i] != null ? "°" : ""}</td>
                  <td>{hourlyChartData.popValues[i]}%</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </details>
      </section>
    {/if}

    <div id="grid">
      {#if forecast.properties?.periods}
        <h2>7-day forecast</h2>
        <div class="swa-forecast-grid">
          {#each forecast.properties.periods as period (period.startTime)}
            <article class="swa-forecast-card">
              <div>
                <span class="swa-forecast-head">
                  <span class="swa-forecast-icon" aria-hidden="true">
                    {mapWeatherToEmoji(period.shortForecast)}
                  </span>
                  <span class="swa-forecast-name">{period.name}</span>
                  <span
                    class="swa-forecast-temp {period.isDaytime
                      ? 'pico-color-red-500'
                      : 'pico-color-azure-500'}"
                  >
                    {period.temperature}°{period.temperatureUnit}
                  </span>
                </span>
                <p class="swa-forecast-short">{period.shortForecast}</p>
                <ul class="swa-chips">
                  <li>Wind {period.windSpeed}</li>
                  {#if period.probabilityOfPrecipitation}
                    <li>
                      Precip {period.probabilityOfPrecipitation.value ?? 0}%
                    </li>
                  {/if}
                  {#if period.relativeHumidity?.value != null}
                    <li>Humidity {period.relativeHumidity.value}%</li>
                  {/if}
                </ul>
              </div>
              <p class="swa-forecast-detail">{period.detailedForecast}</p>
            </article>
          {/each}
        </div>
      {/if}
    </div>

    <div class="swa-map-wrap">
      {#if mapCoords}
        <h2>Radar</h2>
        <div class="swa-map-controls">
          <label>
            <input type="checkbox" bind:checked={showRadar} />
            Radar
          </label>
          <label>
            <input type="checkbox" bind:checked={showWatchWarn} />
            Watches &amp; warnings
          </label>
        </div>
        {#key mapKey}
          <div
            id="map"
            role="region"
            aria-label="Weather radar map"
            {@attach mapAttachment}
          >
            {#if mapError}
              <div class="swa-map-error" role="alert">{mapError}</div>
            {:else if !mapReady}
              <div class="swa-map-placeholder" aria-hidden="true">
                Loading radar map…
              </div>
            {/if}
          </div>
        {/key}
        <ul class="swa-legend" aria-label="Map legend">
          <li>
            <span class="swa-legend-radar"></span>Radar reflectivity
          </li>
          <li>
            <span class="swa-legend-warn"></span>Watch / warning
          </li>
          <li>
            <span class="swa-legend-you"></span>Your location
          </li>
        </ul>
        <p class="swa-map-caption">
          Radar: NOAA NWS, refreshes about every 5 minutes. Scroll with two
          fingers or Ctrl+scroll; use +/− buttons to zoom.
        </p>
      {/if}
    </div>
    <br />

    {#if NWSURL || officeId}
      <section aria-labelledby="resources-heading">
        <h2 id="resources-heading">Forecast resources</h2>
        <ul class="swa-resources">
          {#if officeId}
            <li>
              <details
                class="swa-afd"
                bind:this={afdDetailsEl}
                ontoggle={(e) => {
                  afdOpen = (e.currentTarget as HTMLDetailsElement).open;
                }}
              >
                <summary>Area Forecast Discussion</summary>
                <div class="swa-afd-body">
                  {#if afdLoading}
                    <p aria-busy="true">Loading discussion…</p>
                  {:else if afdError}
                    <p class="swa-error" role="alert">{afdError}</p>
                    <button type="button" onclick={() => void loadAfd(true)}>
                      Try again
                    </button>
                  {:else if afd?.productText}
                    {#if afd.issuanceTime}
                      <p class="swa-meta">
                        Issued {formatIso(afd.issuanceTime)}
                      </p>
                    {/if}
                    {#if afdBlocks.length > 0}
                      {#each afdBlocks as block, i (i)}
                        {#if block.kind === "hr"}
                          <hr class="swa-afd-hr" />
                        {:else if block.kind === "heading"}
                          <h3 class="swa-afd-heading">{block.text}</h3>
                        {:else if block.kind === "list"}
                          <ul class="swa-afd-list">
                            {#each block.items as item, j (j)}
                              <li>{item}</li>
                            {/each}
                          </ul>
                        {:else}
                          <p class="swa-afd-para">{block.text}</p>
                        {/if}
                      {/each}
                    {:else}
                      <pre class="swa-afd-text">{afd.productText.trim()}</pre>
                    {/if}
                  {:else}
                    <p class="swa-meta">
                      Open to fetch the latest discussion from the National
                      Weather Service.
                    </p>
                  {/if}
                </div>
              </details>
            </li>
            {#if briefingUrl}
              <li>
                <a
                  class="swa-resource-link"
                  href={briefingUrl}
                  target="_blank"
                  rel="noopener"
                >
                  Weather Briefing (PDF)
                </a>
              </li>
            {/if}
          {/if}
          {#if NWSURL}
            <li>
              <a class="swa-resource-link" href={NWSURL}>NWS Forecast Page</a>
            </li>
          {/if}
        </ul>
      </section>
    {/if}
    <br />

    <p class="swa-center">
      This forecast is generated from the U.S. National Weather Service's
      <a href="https://www.weather.gov/documentation/services-web-api"
        >weather.gov API</a
      >
      using this
      <a href="https://github.com/jquagga/swa">Simple Weather</a> app.
    </p>
  </div>

  {#snippet failed(error, reset)}
    <div class="swa-error-box">
      <p class="swa-error">An error occurred: {(error as Error).message}</p>
      <button onclick={reset}>Try Again</button>
    </div>
  {/snippet}
</svelte:boundary>
