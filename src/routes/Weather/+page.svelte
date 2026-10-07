<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
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
      relativeLocation?: {
        properties: {
          city: string;
          state: string;
        };
      };
      forecastHourly?: string;
      forecast?: string;
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
      value: number;
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

  type ChartData = {
    labels: string[];
    isos: string[];
    tempValues: number[];
    apparentTempValues: number[];
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
  let forecastHourly = $state.raw<ForecastData>({});
  let NWSURL = $state("");
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

  const DATASET_CONFIG = {
    TEMPERATURE: {
      unit: "°F",
      defaultPointRadius: 3,
    },
    APPARENT_TEMPERATURE: {
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
      point,
      alerts,
      forecast,
      forecastHourly,
      NWSURL,
      savedAt: new Date().toISOString(),
    });
    try {
      // Merge the stored index with any legacy keys already in storage so
      // pre-index entries are managed, then free space *before* writing.
      const merged = [
        key,
        ...readCacheIndex().filter((k) => k !== key),
      ];
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
      if (s === "pico-background-yellow-100") alert.properties.severity = "Severe";
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
        point: WeatherPoint;
        alerts: WeatherAlert;
        forecast: ForecastData;
        forecastHourly: ForecastData;
        NWSURL: string;
        savedAt: string;
      };
      if (!data?.savedAt || !data?.point?.properties) return null;
      if (Date.now() - Date.parse(data.savedAt) > CACHE_TTL_MS) return null;
      normalizeCachedAlertSeverity(data.alerts ?? { features: [] });
      point = data.point;
      alerts = data.alerts ?? { features: [] };
      forecast = data.forecast ?? {};
      forecastHourly = data.forecastHourly ?? {};
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

  function calculateApparentTemperature(
    tempF: number,
    humidity: number,
    windSpeedMph: number,
  ): number {
    // "Feels like" decision flow:
    //   tempF <= 51 → wind chill (accounts for wind cooling)
    //   tempF >= 80 && humidity >= 40 → heat index (accounts for humidity)
    //   otherwise → return actual temperature
    if (tempF <= 51) {
      const mag = windSpeedMph * 1.15;
      return mag <= 3
        ? tempF
        : 35.74 +
            0.6215 * tempF -
            35.75 * Math.pow(mag, 0.16) +
            0.4275 * tempF * Math.pow(mag, 0.16);
    }

    if (tempF < 80.0) {
      return tempF;
    }

    const t2 = Math.pow(tempF, 2);
    const h2 = Math.pow(humidity, 2);
    const heatindexF =
      -42.379 +
      2.04901523 * tempF +
      10.14333127 * humidity -
      0.22475541 * tempF * humidity -
      6.83783e-3 * t2 -
      5.481717e-2 * h2 +
      1.22874e-3 * t2 * humidity +
      8.5282e-4 * tempF * h2 -
      1.99e-6 * t2 * h2;

    if (heatindexF < tempF) {
      return tempF;
    }

    return heatindexF;
  }

  let hourlyChartData = $derived.by((): ChartData => {
    if (!forecastHourly.properties?.periods) {
      return {
        labels: [],
        isos: [],
        tempValues: [],
        apparentTempValues: [],
        popValues: [],
        windLabels: [],
        humidityValues: [],
      };
    }

    const labels: string[] = [];
    const isos: string[] = [];
    const tempValues: number[] = [];
    const apparentTempValues: number[] = [];
    const popValues: number[] = [];
    const windLabels: string[] = [];
    const humidityValues: number[] = [];

    // Filter to upcoming periods first so apparent-temp math only runs
    // for the GRAPH_HOURS actually displayed.
    const nowMs = Date.now();
    const upcoming: WeatherPeriod[] = [];
    for (const period of forecastHourly.properties.periods) {
      if (upcoming.length >= GRAPH_HOURS) break;
      if (nowMs > Date.parse(period.endTime)) continue;
      upcoming.push(period);
    }

    for (const period of upcoming) {
      const windSpeedValue = parseFloat(period.windSpeed.split(" ")[0]);
      const apparentTemp = calculateApparentTemperature(
        period.temperature,
        period.relativeHumidity.value,
        Number.isFinite(windSpeedValue) ? windSpeedValue : 0,
      );
      const ms = Date.parse(period.startTime);
      labels.push(
        Number.isFinite(ms)
          ? hourLabelFmt.format(new Date(ms))
          : period.startTime,
      );
      isos.push(period.startTime);
      tempValues.push(period.temperature);
      popValues.push(period.probabilityOfPrecipitation?.value ?? 0);
      apparentTempValues.push(Math.round(apparentTemp));
      windLabels.push(period.windSpeed);
      humidityValues.push(period.relativeHumidity.value ?? 0);
    }

    return {
      labels,
      isos,
      tempValues,
      apparentTempValues,
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
    const hourly = forecastHourly.properties?.periods?.[0];
    const daily = forecast.properties?.periods?.[0];
    if (!hourly && !daily) return null;
    const source = hourly ?? daily;
    if (!source) return null;
    const windSpeedValue = parseFloat(source.windSpeed.split(" ")[0]);
    const feelsLike = Math.round(
      calculateApparentTemperature(
        source.temperature,
        source.relativeHumidity.value ?? 0,
        Number.isFinite(windSpeedValue) ? windSpeedValue : 0,
      ),
    );
    return {
      temperature: source.temperature,
      temperatureUnit: source.temperatureUnit || "°F",
      feelsLike,
      shortForecast: source.shortForecast,
      windSpeed: source.windSpeed,
      humidity: source.relativeHumidity.value ?? 0,
      pop: source.probabilityOfPrecipitation?.value ?? null,
      isDaytime: source.isDaytime,
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
    clearLocationState();
    geolocationError = null;
    isLoading = true;
    try {
      await processWeather(parsed.latitude, parsed.longitude, requestId);
    } catch (error) {
      console.error("Error refreshing weather data:", error);
      const cached = loadCached(parsed.latitude, parsed.longitude);
      if (!cached) {
        geolocationError =
          "Unable to refresh weather data. Please try again.";
      }
      isLoading = false;
    }
  }

  function buildChartConfig(chartData: ChartData): ChartConfiguration {
    const tempPointRadius = getPointRadius(
      DATASET_CONFIG.TEMPERATURE.defaultPointRadius,
      chartData.labels.length,
    );
    const apparentTempPointRadius = getPointRadius(
      DATASET_CONFIG.APPARENT_TEMPERATURE.defaultPointRadius,
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
    const feelsDataset: UnitLineDataset = {
      type: "line" as const,
      label: "Feels Like",
      data: chartData.apparentTempValues,
      borderColor: "#475569",
      backgroundColor: "transparent",
      borderDash: [6, 4],
      tension: 0.4,
      yAxisID: "y",
      pointRadius: apparentTempPointRadius,
      pointHoverRadius: apparentTempPointRadius + 3,
      pointBackgroundColor: "#475569",
      pointBorderColor: "#475569",
      pointBorderWidth: 1,
      pointStyle: "rectRot",
      borderWidth: 2,
      unit: DATASET_CONFIG.APPARENT_TEMPERATURE.unit,
      isos: chartData.isos,
      winds: chartData.windLabels,
      humidities: chartData.humidityValues,
    };
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
        datasets: [tempDataset as never, feelsDataset as never, popDataset as never],
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
      const data = hourlyChartData;
      if (instance) {
        instance.data.labels = data.labels;
        if (instance.data.datasets[0]) {
          instance.data.datasets[0].data = data.tempValues as never;
          Object.assign(instance.data.datasets[0], {
            isos: data.isos,
            winds: data.windLabels,
            humidities: data.humidityValues,
          });
        }
        if (instance.data.datasets[1]) {
          instance.data.datasets[1].data = data.apparentTempValues as never;
          Object.assign(instance.data.datasets[1], {
            isos: data.isos,
            winds: data.windLabels,
            humidities: data.humidityValues,
          });
        }
        if (instance.data.datasets[2]) {
          instance.data.datasets[2].data = data.popValues as never;
          Object.assign(instance.data.datasets[2], {
            isos: data.isos,
            winds: data.windLabels,
            humidities: data.humidityValues,
          });
        }
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
            typeof (source as { setTiles?: unknown }).setTiles ===
              "function"
          ) {
            (
              source as unknown as { setTiles: (t: string[]) => void }
            ).setTiles(wmsTiles(base));
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
        if (destroyed) return;

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
          ensureNwsOverlays();
          mapReady = true;
          mapInstanceRef = mapInstance;
        });
        // Fires after every setStyle() (e.g. dark-mode toggle).
        mapInstance.on("styledata", ensureNwsOverlays);
        mapInstance.on("error", (e) => {
          console.warn("Map error:", e.error ?? e);
        });
        mapInstanceRef = mapInstance;

        refreshTimer = setInterval(refreshRadarTiles, RADAR_REFRESH_MS);
      } catch (e) {
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
      if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
      }
      mapInstanceRef = null;
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

  function isCurrentRequest(requestId: number): boolean {
    return requestId === weatherRequestId;
  }

  function clearLocationState(): void {
    point = {};
    alerts = { features: [] };
    forecast = {};
    forecastHourly = {};
    NWSURL = "";
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

      const hourlyUrl = pointData.properties.forecastHourly;
      const forecastUrl = pointData.properties.forecast;
      if (!hourlyUrl || !forecastUrl) {
        throw new Error("Invalid location data received");
      }

      const [hourlyForecastData, weeklyForecastData] = await Promise.all([
        fetchData<ForecastData>(hourlyUrl),
        fetchData<ForecastData>(forecastUrl),
      ]);
      if (!isCurrentRequest(requestId)) return;

      forecastHourly = hourlyForecastData;
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

  async function fetchAlertsAsync(
    latitude: number,
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
        geolocationError =
          "Failed to process weather data. Please try again.";
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
            <p class="swa-hero-feels">Feels like {currentHero.feelsLike}°</p>
          </div>
        </div>
        <ul class="swa-chips">
          {#if currentHero.dailyHighLow}
            <li>{currentHero.dailyName ?? "Today"}: {currentHero.dailyHighLow}</li>
          {/if}
          <li>Wind {currentHero.windSpeed}</li>
          <li>Humidity {currentHero.humidity}%</li>
          {#if currentHero.pop !== null}
            <li>Precip {currentHero.pop}%</li>
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
                <p class="swa-meta">Effective {formatIso(alert.properties.effective)}</p>
              {/if}
              <p>{alert.properties.description}</p>
              {#if alert.properties.instruction}
                <p><strong>What to do:</strong> {alert.properties.instruction}</p>
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
            aria-label="Hourly temperature, feels-like, and chance of precipitation for the next 24 hours"
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
                <th scope="col">Feels like</th>
                <th scope="col">Precip</th>
              </tr>
            </thead>
            <tbody>
              {#each hourlyChartData.labels as label, i (hourlyChartData.isos[i] ?? label)}
                <tr>
                  <th scope="row">{formatIso(hourlyChartData.isos[i] ?? label)}</th>
                  <td>{hourlyChartData.tempValues[i]}°</td>
                  <td>{hourlyChartData.apparentTempValues[i]}°</td>
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
                    <li>Precip {period.probabilityOfPrecipitation.value ?? 0}%</li>
                  {/if}
                  {#if period.relativeHumidity}
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

    {#if NWSURL}
      <div class="swa-center">
        <a href={NWSURL} role="button">Weather.gov forecast</a>
      </div>
    {/if}
    <br />

    <p class="swa-center">
      This forecast is generated from the U.S. National Weather Service's
      <a href="https://www.weather.gov/documentation/services-web-api"
        >weather.gov API</a
      >
      using this
      <a href="https://github.com/jquagga/swa">Simple Weather App</a>.
    </p>
  </div>

  {#snippet failed(error, reset)}
    <div class="swa-error-box">
      <p class="swa-error">An error occurred: {(error as Error).message}</p>
      <button onclick={reset}>Try Again</button>
    </div>
  {/snippet}
</svelte:boundary>
