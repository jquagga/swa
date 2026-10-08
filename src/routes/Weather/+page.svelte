<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { parseAfdProduct, unwrapNwsHardWrap } from "#lib/afd.js";
  import { buildChartConfig } from "#lib/chart-config.js";
  import type { Chart as ChartInstance } from "chart.js";
  import {
    buildHourlyChartData,
    type ChartData,
    type GridpointData,
  } from "#lib/grid.js";
  import {
    loadCachedSnapshot,
    saveCachedSnapshot,
    type AfdProduct,
    type ForecastData,
    type WeatherAlert,
    type WeatherPoint,
  } from "#lib/weather-cache.js";
  import { fetchData } from "#lib/weather-fetch.js";
  import { mapWeatherToEmoji } from "#lib/weather-emoji.js";
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

  function saveCached(latitude: number, longitude: number): void {
    saveCachedSnapshot(latitude, longitude, {
      point,
      alerts,
      forecast,
      gridData,
      NWSURL,
    });
  }

  function loadCached(
    latitude: number,
    longitude: number,
  ): { savedAt: string } | null {
    const data = loadCachedSnapshot(latitude, longitude);
    if (!data) return null;
    point = data.point;
    alerts = data.alerts;
    forecast = data.forecast;
    gridData = data.gridData;
    NWSURL = data.NWSURL;
    hourlyForecastProcessed = true;
    isOffline = true;
    offlineSavedAt = data.savedAt;
    fetchedAt = data.savedAt;
    updateBadge();
    return { savedAt: data.savedAt };
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
        return "border-l-yellow-500 bg-yellow-400/20";
      case "Extreme":
      case "pico-background-red-500":
        return "border-l-red-600 bg-red-600/10";
      case "Moderate":
        return "border-l-orange-500 bg-orange-500/15";
      case "Minor":
        return "border-l-brand-600 bg-brand-600/10";
      default:
        return "border-l-zinc-400";
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

  function formatAlertText(text: string | undefined | null): string {
    if (!text) return "";
    return unwrapNwsHardWrap(text);
  }

  let hourlyChartData = $derived.by(
    (): ChartData => buildHourlyChartData(gridData.properties, hourLabelFmt),
  );

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

  function chartAttachment(canvas: HTMLCanvasElement) {
    let instance: ChartInstance | null = null;
    let destroyed = false;

    async function init() {
      try {
        const lib = await ensureChartLib();
        if (destroyed) return;
        instance = new lib.Chart(
          canvas,
          buildChartConfig(hourlyChartData, formatIso),
        );
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
        const next = buildChartConfig(data, formatIso);
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

<svelte:head>
  <title>{locationDisplay} – Simple Weather</title>
  <meta
    name="description"
    content="Hourly, 7-day, radar, and alerts for {locationDisplay} from the US National Weather Service."
  />
</svelte:head>

<svelte:boundary>
  <div class="shell">
    <div class="my-3 flex flex-wrap items-center gap-2">
      <a href="/" class="font-semibold no-underline">← New search</a>
      <span class="flex-1"></span>
      <button
        type="button"
        class="btn"
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
      <p class="meta">
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
      <div class="px-5 py-5 text-center" role="alert">
        <p class="err">{geolocationError}</p>
        <button
          type="button"
          class="btn mt-3"
          onclick={refreshForecast}
          disabled={isLoading}
        >
          Try again
        </button>
      </div>
    {/if}

    {#if showLoading}
      <div aria-busy="true" aria-label="Fetching weather data">
        <div
          class="my-4 h-36 animate-pulse rounded-lg bg-zinc-200 motion-reduce:animate-none dark:bg-zinc-800"
        ></div>
        <div
          class="my-2.5 h-14 animate-pulse rounded-lg bg-zinc-200 motion-reduce:animate-none dark:bg-zinc-800"
        ></div>
        <div
          class="my-2.5 h-14 animate-pulse rounded-lg bg-zinc-200 motion-reduce:animate-none dark:bg-zinc-800"
        ></div>
        <div
          class="my-2.5 h-14 animate-pulse rounded-lg bg-zinc-200 motion-reduce:animate-none dark:bg-zinc-800"
        ></div>
      </div>
    {/if}

    {#if currentHero}
      <section class="card my-4" aria-label="Current conditions">
        <div class="flex flex-wrap items-center gap-4">
          <span class="text-4xl leading-none" aria-hidden="true">
            {mapWeatherToEmoji(currentHero.shortForecast)}
          </span>
          <span class="text-5xl leading-none font-bold">
            {currentHero.temperature}°{currentHero.temperatureUnit === "°F" ||
            currentHero.temperatureUnit === "F"
              ? ""
              : ` ${currentHero.temperatureUnit}`}
          </span>
          <div>
            <p class="mt-1 font-semibold">{currentHero.shortForecast}</p>
            {#if currentHero.heatIndex !== null}
              <p
                class="text-[0.95rem] text-zinc-500 dark:text-zinc-400"
              >
                Heat index {currentHero.heatIndex}°
              </p>
            {:else if currentHero.windChill !== null}
              <p
                class="text-[0.95rem] text-zinc-500 dark:text-zinc-400"
              >
                Wind chill {currentHero.windChill}°
              </p>
            {/if}
          </div>
        </div>
        <ul class="m-0 mt-3 flex list-none flex-wrap gap-1.5 p-0">
          {#if currentHero.dailyHighLow}
            <li class="chip">
              {currentHero.dailyName ?? "Today"}: {currentHero.dailyHighLow}
            </li>
          {/if}
          <li class="chip">Wind {currentHero.windSpeed}</li>
          {#if currentHero.humidity !== null}
            <li class="chip">Humidity {currentHero.humidity}%</li>
          {/if}
          {#if currentHero.pop !== null}
            <li class="chip">Precip {currentHero.pop}%</li>
          {/if}
          {#if nextSunEvent}
            <li class="chip">
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
          <details
            class="mb-2.5 overflow-hidden rounded-lg border border-l-4 border-zinc-200 dark:border-zinc-800 {alertTone(
              alert.properties.severity,
            )}"
          >
            <summary
              class="cursor-pointer list-none px-3 py-2.5 font-bold before:content-['⚠_'] [&::-webkit-details-marker]:hidden"
            >
              {alert.properties.event}
              <span class="ml-2 text-xs font-normal opacity-85">
                {alertSeverityLabel(alert.properties.severity)}
              </span>
            </summary>
            <div class="px-3 pb-3">
              {#if alert.properties.effective}
                <p class="meta">
                  Effective {formatIso(alert.properties.effective)}
                </p>
              {/if}
              <p class="mb-2.5 whitespace-pre-wrap">
                {formatAlertText(alert.properties.description)}
              </p>
              {#if alert.properties.instruction}
                <p class="mb-0 whitespace-pre-wrap">
                  <strong>What to do:</strong>
                  {formatAlertText(alert.properties.instruction)}
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
        <div class="mt-5 h-[260px] md:h-[340px]">
          <canvas
            id="myChart"
            aria-label="Hourly temperature, heat index, wind chill, and chance of precipitation for the next 24 hours"
            {@attach chartAttachment}
          ></canvas>
        </div>
        {#if hourlyHigh !== null && hourlyLow !== null}
          <p class="meta mt-1.5">
            High {hourlyHigh}° • Low {hourlyLow}° • Bars show chance of
            precipitation (right axis).
          </p>
        {/if}
        <details>
          <summary class="cursor-pointer text-sm"
            >Hourly data table (accessible alternative)</summary
          >
          <table class="data-table mt-2 text-[0.85rem]">
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
        <div class="my-4 grid gap-2.5 md:grid-cols-2">
          {#each forecast.properties.periods as period (period.startTime)}
            <article
              class="m-0 rounded-lg border border-zinc-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div>
                <span class="flex flex-wrap items-baseline gap-2">
                  <span aria-hidden="true">
                    {mapWeatherToEmoji(period.shortForecast)}
                  </span>
                  <span class="font-bold">{period.name}</span>
                  <span
                    class="font-bold {period.isDaytime
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-sky-600 dark:text-sky-400'}"
                  >
                    {period.temperature}°{period.temperatureUnit}
                  </span>
                </span>
                <p class="mt-1 mb-2">{period.shortForecast}</p>
                <ul class="m-0 flex list-none flex-wrap gap-1.5 p-0">
                  <li class="chip">Wind {period.windSpeed}</li>
                  {#if period.probabilityOfPrecipitation}
                    <li class="chip">
                      Precip {period.probabilityOfPrecipitation.value ?? 0}%
                    </li>
                  {/if}
                  {#if period.relativeHumidity?.value != null}
                    <li class="chip">
                      Humidity {period.relativeHumidity.value}%
                    </li>
                  {/if}
                </ul>
              </div>
              <p class="mt-2 text-[0.92rem] whitespace-pre-wrap">
                {period.detailedForecast}
              </p>
            </article>
          {/each}
        </div>
      {/if}
    </div>

    <div class="mt-4">
      {#if mapCoords}
        <h2>Radar</h2>
        <div class="my-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <label class="m-0 flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              class="size-4 accent-brand-700"
              bind:checked={showRadar}
            />
            Radar
          </label>
          <label class="m-0 flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              class="size-4 accent-brand-700"
              bind:checked={showWatchWarn}
            />
            Watches &amp; warnings
          </label>
        </div>
        {#key mapKey}
          <div
            id="map"
            role="region"
            aria-label="Weather radar map"
            class="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
            {@attach mapAttachment}
          >
            {#if mapError}
              <div
                class="absolute inset-0 flex items-center justify-center bg-zinc-100 p-4 text-center dark:bg-zinc-800"
                role="alert"
              >
                {mapError}
              </div>
            {:else if !mapReady}
              <div
                class="absolute inset-0 flex items-center justify-center bg-zinc-100 p-4 text-center dark:bg-zinc-800"
                aria-hidden="true"
              >
                Loading radar map…
              </div>
            {/if}
          </div>
        {/key}
        <ul
          class="m-0 mt-1.5 flex list-none flex-wrap gap-3 p-0 text-[0.85rem]"
          aria-label="Map legend"
        >
          <li class="m-0 list-none">
            <span
              class="mr-1.5 inline-block h-[0.7em] w-[1.6em] rounded-sm border border-sky-700 bg-sky-600/70 align-middle"
            ></span>Radar reflectivity
          </li>
          <li class="m-0 list-none">
            <span
              class="mr-1.5 inline-block h-[0.7em] w-[1.6em] rounded-sm border border-red-600 bg-red-600/55 align-middle"
            ></span>Watch / warning
          </li>
          <li class="m-0 list-none">
            <span
              class="mr-1.5 inline-block size-[0.7em] rounded-full bg-sky-600 align-middle"
            ></span>Your location
          </li>
        </ul>
        <p class="meta mt-1.5">
          Radar: NOAA NWS, refreshes about every 5 minutes. Scroll with two
          fingers or Ctrl+scroll; use +/− buttons to zoom.
        </p>
      {/if}
    </div>

    {#if NWSURL || officeId}
      <section aria-labelledby="resources-heading">
        <h2 id="resources-heading">Forecast resources</h2>
        <ul class="m-0 my-4 grid list-none gap-2 p-0">
          {#if officeId}
            <li class="m-0 list-none">
              <details
                class="rounded-lg border border-zinc-200 px-3.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-900"
                bind:this={afdDetailsEl}
                ontoggle={(e) => {
                  afdOpen = (e.currentTarget as HTMLDetailsElement).open;
                }}
              >
                <summary class="cursor-pointer font-semibold"
                  >Area Forecast Discussion</summary
                >
                <div class="pt-2">
                  {#if afdLoading}
                    <p aria-busy="true">Loading discussion…</p>
                  {:else if afdError}
                    <p class="err" role="alert">{afdError}</p>
                    <button
                      type="button"
                      class="btn mt-2"
                      onclick={() => void loadAfd(true)}
                    >
                      Try again
                    </button>
                  {:else if afd?.productText}
                    {#if afd.issuanceTime}
                      <p class="meta">
                        Issued {formatIso(afd.issuanceTime)}
                      </p>
                    {/if}
                    {#if afdBlocks.length > 0}
                      {#each afdBlocks as block, i (i)}
                        {#if block.kind === "hr"}
                          <hr
                            class="my-3.5 border-zinc-200 dark:border-zinc-700"
                          />
                        {:else if block.kind === "heading"}
                          <h3 class="mt-3.5 mb-1.5 text-base font-semibold">
                            {block.text}
                          </h3>
                        {:else if block.kind === "list"}
                          <ul
                            class="mb-2.5 list-disc space-y-1 pl-5 text-[0.92rem]"
                          >
                            {#each block.items as item, j (j)}
                              <li>{item}</li>
                            {/each}
                          </ul>
                        {:else}
                          <p class="mb-2.5 text-[0.92rem]">{block.text}</p>
                        {/if}
                      {/each}
                    {:else}
                      <pre
                        class="mt-2 text-[0.85rem] break-words whitespace-pre-wrap"
                        >{afd.productText.trim()}</pre
                      >
                    {/if}
                  {:else}
                    <p class="meta">
                      Open to fetch the latest discussion from the National
                      Weather Service.
                    </p>
                  {/if}
                </div>
              </details>
            </li>
            {#if briefingUrl}
              <li class="m-0 list-none">
                <a
                  class="block rounded-lg border border-zinc-200 px-3.5 py-2.5 font-semibold no-underline dark:border-zinc-800"
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
            <li class="m-0 list-none">
              <a
                class="block rounded-lg border border-zinc-200 px-3.5 py-2.5 font-semibold no-underline dark:border-zinc-800"
                href={NWSURL}>NWS Forecast Page</a
              >
            </li>
          {/if}
        </ul>
      </section>
    {/if}

    <p class="mt-6 mb-6 text-center">
      This forecast is generated from the U.S. National Weather Service's
      <a href="https://www.weather.gov/documentation/services-web-api"
        >weather.gov API</a
      >
      using this
      <a href="https://github.com/jquagga/swa">Simple Weather</a> app.
    </p>
  </div>

  {#snippet failed(error, reset)}
    <div class="px-5 py-5 text-center">
      <p class="err">An error occurred: {(error as Error).message}</p>
      <button class="btn mt-3" onclick={reset}>Try Again</button>
    </div>
  {/snippet}
</svelte:boundary>
