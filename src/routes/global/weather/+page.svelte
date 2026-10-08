<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { buildOpenMeteoChartConfig } from "#lib/openmeteo-chart.js";
  import {
    buildHourlyDisplay,
    fetchOpenMeteo,
    type HourPoint,
  } from "#lib/openmeteo.js";
  import {
    loadOpenMeteoSnapshot,
    saveOpenMeteoSnapshot,
  } from "#lib/openmeteo-cache.js";
  import { initPrefs, prefs } from "#lib/prefs.svelte.js";
  import { setStoredProvider } from "#lib/preferences.js";
  import { mapWeatherToEmoji } from "#lib/weather-emoji.js";
  import {
    buildForecast,
    formatWind,
    localHour,
    type ForecastPeriod,
    type HourlySeries,
  } from "#lib/zfp/index.js";
  import type { Chart as ChartInstance } from "chart.js";
  import * as m from "#lib/paraglide/messages.js";

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

  let series = $state.raw<HourlySeries | null>(null);
  let timezone = $state("UTC");
  let placeName = $state("");
  let fetchError = $state<string | null>(null);
  let isLoading = $state(true);
  let isOffline = $state(false);
  let offlineSavedAt = $state<string | null>(null);
  let fetchedAt = $state<string | null>(null);
  let requestId = 0;

  let coords = $derived.by(() => {
    const latStr = page.url.searchParams.get("lat");
    const lonStr = page.url.searchParams.get("lon");
    if (!latStr?.trim() || !lonStr?.trim()) return null;
    const lat = Number(latStr);
    const lon = Number(lonStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  });
  let nameParam = $derived(page.url.searchParams.get("name") ?? "");

  let tempUnitLabel = $derived(prefs.units === "us" ? "°F" : "°C");
  let zfpLocale = $derived(
    (["en", "es", "fr"] as const).includes(prefs.locale as "en" | "es" | "fr")
      ? (prefs.locale as "en" | "es" | "fr")
      : "en",
  );

  // All timestamps from the SDK adapter are true UTC instants; every
  // formatter pins the FORECAST location's timezone (not the device zone)
  // so day titles, hour labels, and tooltips agree with the ZFP periods.
  // An invalid zone falls back to the device zone rather than crashing.
  function zonedFmt(
    opts: Intl.DateTimeFormatOptions,
  ): Intl.DateTimeFormat {
    try {
      return new Intl.DateTimeFormat(prefs.locale, {
        ...opts,
        timeZone: timezone,
      });
    } catch {
      return new Intl.DateTimeFormat(prefs.locale, opts);
    }
  }

  let hourLabelFmt = $derived(
    zonedFmt({ hour: "numeric", weekday: "short" }),
  );
  let weekdayFmt = $derived(
    zonedFmt({
      weekday: "long",
    }),
  );
  let tooltipTitleFmt = $derived(
    zonedFmt({
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
  );

  function formatIso(iso: string): string {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return iso;
    try {
      return tooltipTitleFmt.format(new Date(ms));
    } catch {
      return iso;
    }
  }

  // Rebuild narrative + hourly display whenever series, locale, or units change.
  let periods = $derived.by((): ForecastPeriod[] => {
    if (!series) return [];
    try {
      return buildForecast(series, { locale: zfpLocale, units: prefs.units });
    } catch (e) {
      console.error("ZFP build failed:", e);
      return [];
    }
  });

  let hours = $derived.by((): HourPoint[] => {
    if (!series) return [];
    try {
      return buildHourlyDisplay(series, prefs.units, hourLabelFmt);
    } catch (e) {
      console.error("Hourly build failed:", e);
      return [];
    }
  });

  let chartReady = $derived(hours.length > 0);
  let hourlyHigh = $derived(hours.length ? Math.max(...hours.map((h) => h.temp)) : null);
  let hourlyLow = $derived(hours.length ? Math.min(...hours.map((h) => h.temp)) : null);

  let hero = $derived.by(() => {
    if (!hours.length || !periods.length) return null;
    const h0 = hours[0];
    const p0 = periods[0];
    const tMax = p0.summary.tMaxC;
    const tMin = p0.summary.tMinC;
    const extreme = p0.summary.period.isDaytime ? tMax : tMin;
    return {
      temp: h0.temp,
      feelsLike: h0.feelsLike,
      short: p0.short,
      wind: h0.wind,
      humidity: h0.humidity,
      pop: h0.pop,
      extreme,
      extremeIsHigh: p0.summary.period.isDaytime,
    };
  });

  let locationDisplay = $derived.by(() => {
    if (fetchError && !series) return fetchError;
    if (placeName) return placeName;
    if (coords) return `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`;
    if (isLoading) return m.weather_loading();
    return m.error_address_not_found();
  });

  // NWS-style titles: weekday + daypart only ("Monday Night"), no dates.
  // The post-midnight tail (12am–6am) is its own block from the coming
  // evening night, but both fall on the same weekday — like the NWS, the
  // tail is titled "Overnight" (locale-aware) so the two never share a name.
  function periodTitle(p: ForecastPeriod): string {
    const word = p.summary.period.isDaytime
      ? m.period_day()
      : localHour(p.summary.period.startMs, timezone) < 6
        ? m.period_overnight()
        : m.period_night();
    // Weekdays are lowercase in es/fr by grammar ("lunes", "lundi"); titles
    // capitalize them per NWS convention (cf. Translator.py day names).
    const cap = (s: string): string =>
      s ? s[0].toUpperCase() + s.slice(1) : s;
    try {
      const weekday = cap(weekdayFmt.format(new Date(p.summary.period.startMs)));
      return `${weekday} ${word}`;
    } catch {
      return word;
    }
  }

  function periodTemp(p: ForecastPeriod): string {
    const c = p.summary.period.isDaytime
      ? (p.summary.tMaxC ?? p.summary.tAvgC)
      : (p.summary.tMinC ?? p.summary.tAvgC);
    if (c == null) return "—";
    const v = prefs.units === "us" ? Math.round((c * 9) / 5 + 32) : Math.round(c);
    return `${v}${tempUnitLabel}`;
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
          buildOpenMeteoChartConfig(hours, formatIso, tempUnitLabel),
        );
      } catch (e) {
        console.error(e);
      }
    }
    void init();
    $effect(() => {
      const data = hours;
      const unit = tempUnitLabel;
      if (instance) {
        const next = buildOpenMeteoChartConfig(data, formatIso, unit);
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

  async function load(lat: number, lon: number, req: number): Promise<void> {
    try {
      const { series: s, timezone: tz } = await fetchOpenMeteo(lat, lon);
      if (req !== requestId) return;
      series = s;
      timezone = tz;
      if (!placeName) placeName = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      fetchError = null;
      isOffline = false;
      offlineSavedAt = null;
      fetchedAt = new Date().toISOString();
      saveOpenMeteoSnapshot(lat, lon, {
        series: s,
        periods: buildForecast(s, { locale: zfpLocale, units: prefs.units }),
        placeName,
        timezone: tz,
        units: prefs.units,
        locale: prefs.locale,
      });
    } catch (e) {
      if (req !== requestId) return;
      console.error("Open-Meteo fetch failed:", e);
      const cached = loadOpenMeteoSnapshot(lat, lon);
      if (cached) {
        series = cached.series;
        timezone = cached.timezone;
        placeName = cached.placeName || placeName;
        isOffline = true;
        offlineSavedAt = cached.savedAt;
        fetchedAt = cached.savedAt;
        fetchError = null;
      } else {
        fetchError = e instanceof Error ? `Error: ${e.message}` : m.error_address_failed();
      }
    } finally {
      if (req === requestId) isLoading = false;
    }
  }

  async function refresh(): Promise<void> {
    if (!coords) return;
    const req = ++requestId;
    isLoading = true;
    fetchError = null;
    await load(coords.lat, coords.lon, req);
  }

  $effect(() => {
    initPrefs();
    setStoredProvider("openmeteo");
    const c = coords;
    const req = ++requestId;
    if (!c) {
      series = null;
      fetchError = m.error_address_not_found();
      isLoading = false;
      return;
    }
    placeName = nameParam || `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`;
    series = null;
    fetchError = null;
    isLoading = true;
    isOffline = false;
    void load(c.lat, c.lon, req);
  });
</script>

<svelte:head>
  <title>{locationDisplay} – Simple Weather</title>
  <meta
    name="description"
    content="Hourly, 7-day, and feels-like forecast for {locationDisplay} from Open-Meteo."
  />
</svelte:head>

<svelte:boundary>
  <div class="shell">
    <div class="my-3 flex flex-wrap items-center gap-2">
      <a href="/global" class="font-semibold no-underline">{m.weather_new_search()}</a>
      <span class="flex-1"></span>
      <button
        type="button"
        class="btn"
        onclick={refresh}
        disabled={isLoading}
        aria-label="Refresh forecast"
      >
        {m.weather_refresh()}
      </button>
    </div>

    <h1>{locationDisplay}</h1>

    {#if coords}
      <p class="meta">
        {coords.lat.toFixed(4)}, {coords.lon.toFixed(4)}
        {#if fetchedAt}
          • Updated {formatIso(fetchedAt)}
        {/if}
        {#if isOffline}
          • {m.weather_offline()}
        {/if}
      </p>
    {/if}

    {#if fetchError && !series}
      <div class="px-5 py-5 text-center" role="alert">
        <p class="err">{fetchError}</p>
        <button type="button" class="btn mt-3" onclick={refresh} disabled={isLoading}>
          {m.weather_retry()}
        </button>
      </div>
    {/if}

    {#if isLoading && !series}
      <div aria-busy="true" aria-label="Fetching weather data">
        <div
          class="my-4 h-36 animate-pulse rounded-lg bg-zinc-200 motion-reduce:animate-none dark:bg-zinc-800"
        ></div>
        <div
          class="my-2.5 h-14 animate-pulse rounded-lg bg-zinc-200 motion-reduce:animate-none dark:bg-zinc-800"
        ></div>
      </div>
    {/if}

    {#if hero}
      <section class="card my-4" aria-label={m.weather_hero_current()}>
        <div class="flex flex-wrap items-center gap-4">
          <span class="text-4xl leading-none" aria-hidden="true">
            {mapWeatherToEmoji(periods[0]?.shortEn ?? "")}
          </span>
          <span class="text-5xl leading-none font-bold">
            {hero.temp}°
          </span>
          <div>
            <p class="mt-1 font-semibold">{hero.short}</p>
            <p class="text-[0.95rem] text-zinc-500 dark:text-zinc-400">
              {m.weather_feels_like({ temp: `${hero.feelsLike}°` })}
            </p>
          </div>
        </div>
        <ul class="m-0 mt-3 flex list-none flex-wrap gap-1.5 p-0">
          {#if hero.extreme != null}
            <li class="chip">
              {hero.extremeIsHigh
                ? m.weather_high({ temp: `${prefs.units === "us" ? Math.round((hero.extreme * 9) / 5 + 32) : Math.round(hero.extreme)}°` })
                : m.weather_low({ temp: `${prefs.units === "us" ? Math.round((hero.extreme * 9) / 5 + 32) : Math.round(hero.extreme)}°` })}
            </li>
          {/if}
          <li class="chip">{m.weather_wind({ value: hero.wind })}</li>
          <li class="chip">{m.weather_humidity({ value: hero.humidity })}</li>
          <li class="chip">{m.weather_precip({ value: hero.pop })}</li>
        </ul>
      </section>
    {/if}

    {#if chartReady}
      <section aria-labelledby="hourly-heading">
        <h2 id="hourly-heading">{m.weather_next_24h()}</h2>
        <div class="mt-5 h-[260px] md:h-[340px]">
          <canvas
            id="omChart"
            aria-label="Hourly temperature, feels-like, and chance of precipitation for the next 24 hours"
            {@attach chartAttachment}
          ></canvas>
        </div>
        {#if hourlyHigh !== null && hourlyLow !== null}
          <p class="meta mt-1.5">
            {m.weather_chart_caption({ high: `${hourlyHigh}°`, low: `${hourlyLow}°` })}
          </p>
        {/if}
        <details>
          <summary class="cursor-pointer text-sm">{m.weather_table_toggle()}</summary>
          <table class="data-table mt-2 text-[0.85rem]">
            <thead>
              <tr>
                <th scope="col">{m.weather_table_time()}</th>
                <th scope="col">{m.weather_table_temp()}</th>
                <th scope="col">{m.weather_table_feels()}</th>
                <th scope="col">{m.weather_table_precip()}</th>
              </tr>
            </thead>
            <tbody>
              {#each hours as h (h.iso)}
                <tr>
                  <th scope="row">{formatIso(h.iso)}</th>
                  <td>{h.temp}°</td>
                  <td>{h.feelsLike}°</td>
                  <td>{h.pop}%</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </details>
      </section>
    {/if}

    {#if periods.length}
      <div id="grid">
        <h2>{m.weather_7day()}</h2>
        <div class="my-4 grid gap-2.5 md:grid-cols-2">
          {#each periods as p (p.summary.period.startMs)}
            <article
              class="m-0 rounded-lg border border-zinc-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div>
                <span class="flex flex-wrap items-baseline gap-2">
                  <span aria-hidden="true">
                    {mapWeatherToEmoji(p.shortEn)}
                  </span>
                  <span class="font-bold">{periodTitle(p)}</span>
                  <span
                    class="font-bold {p.summary.period.isDaytime
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-sky-600 dark:text-sky-400'}"
                  >
                    {periodTemp(p)}
                  </span>
                </span>
                <p class="mt-1 mb-2">{p.short}</p>
                <ul class="m-0 flex list-none flex-wrap gap-1.5 p-0">
                  {#if p.summary.windKph != null}
                    <li class="chip">
                      {m.weather_wind({ value: formatWind(p.summary.windKph, prefs.units) })}
                    </li>
                  {/if}
                  {#if p.summary.popMax > 0}
                    <li class="chip">{m.weather_precip({ value: p.summary.popMax })}</li>
                  {/if}
                  {#if p.summary.humidityAvg != null}
                    <li class="chip">
                      {m.weather_humidity({ value: Math.round(p.summary.humidityAvg) })}
                    </li>
                  {/if}
                </ul>
              </div>
              <p class="mt-2 text-[0.92rem] whitespace-pre-wrap">
                {p.narrative}
              </p>
            </article>
          {/each}
        </div>
      </div>
    {/if}

    <p class="mt-6 mb-6 text-center">
      {m.weather_footer_openmeteo()}
      <a href="https://github.com/jquagga/swa">Simple Weather</a>.
    </p>
  </div>

  {#snippet failed(error, reset)}
    <div class="px-5 py-5 text-center">
      <p class="err">An error occurred: {(error as Error).message}</p>
      <button class="btn mt-3" onclick={reset}>{m.weather_retry()}</button>
    </div>
  {/snippet}
</svelte:boundary>
