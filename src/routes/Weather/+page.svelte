<script lang="ts">
  import { page } from "$app/state";
  import { DateTime } from "luxon";
  import type { Chart } from "chart.js/auto";
  import "maplibre-gl/dist/maplibre-gl.css";

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
    tempValues: number[];
    apparentTempValues: number[];
    popValues: number[];
  };

  let point = $state.raw<WeatherPoint>({});
  let alerts = $state<WeatherAlert>({ features: [] });
  let forecast = $state<ForecastData>({});
  let forecastHourly = $state.raw<ForecastData>({});
  let NWSURL = $state("");
  let geolocationError = $state<string | null>(null);
  let isLoading = $state(true);
  let hourlyForecastProcessed = $state(false);
  let chartModule: typeof Chart | null = null;
  let maplibreglModule: typeof import("maplibre-gl") | null = null;

  const MAX_RETRIES = 3;
  const GRAPH_HOURS = 25;
  const USER_AGENT = "https://github.com/jquagga/swa";

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

  async function getChartConstructor(): Promise<typeof Chart> {
    if (!chartModule) {
      const [chartJsModule] = await Promise.all([
        import("chart.js/auto"),
        import("chartjs-adapter-luxon"),
      ]);
      chartModule = chartJsModule.default as typeof Chart;
    }

    const ChartCtor = chartModule;
    if (!ChartCtor) {
      throw new Error("Chart module failed to load");
    }

    return ChartCtor;
  }

  async function getMapLibreModule(): Promise<typeof import("maplibre-gl")> {
    if (!maplibreglModule) {
      const module = await import("maplibre-gl");
      maplibreglModule = module;
    }

    const maplibre = maplibreglModule;
    if (!maplibre) {
      throw new Error("maplibre-gl module failed to load");
    }

    return maplibre;
  }

  function formatTooltipTitle(
    context: import("chart.js").TooltipItem<any>[],
  ): string {
    try {
      if (!context || context.length === 0) {
        return "No data available";
      }

      const xValue = context[0].parsed.x;
      const date = DateTime.fromMillis(xValue);

      if (date.isValid) {
        return date.toFormat("EEE, MMM d, h:mm a");
      }

      if (context[0].label) {
        const fallbackDate = DateTime.fromISO(context[0].label);
        if (fallbackDate.isValid) {
          return fallbackDate.toFormat("EEE, MMM d, h:mm a");
        }
        return new Date(context[0].label).toLocaleString();
      }

      return "Invalid date";
    } catch (e) {
      return context && context[0] && context[0].label
        ? context[0].label
        : "Date error";
    }
  }

  function formatTooltipLabel(
    context: import("chart.js").TooltipItem<any>,
  ): string {
    try {
      let label = context.dataset.label || "";
      if (label) {
        label += ": ";
      }

      const unit = context.dataset.unit || "";
      label += context.parsed.y + unit;
      return label;
    } catch (e) {
      return "Data error";
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

  async function fetchData(url: string): Promise<any> {
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

        const data = await response.json();

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

  function processAlertSeverity(alerts: WeatherAlert): void {
    if (!alerts.features) return;

    alerts.features.forEach((alert) => {
      switch (alert.properties.severity) {
        case "Severe":
          alert.properties.severity = "pico-background-yellow-100";
          break;
        case "Extreme":
          alert.properties.severity = "pico-background-red-500";
          break;
        default:
          alert.properties.severity = "primary";
      }
    });
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

  function processForecastEmojis(forecast: ForecastData): void {
    if (!forecast.properties?.periods) return;

    forecast.properties.periods.forEach((period) => {
      period.shortForecast = mapWeatherToEmoji(period.shortForecast);
    });
  }

  function calculateApparentTemperature(
    tempF: number,
    humidity: number,
    windSpeedMph: number,
  ): number {
    if (tempF <= 51) {
      const mag = windSpeedMph * 1.15;
      return mag <= 3
        ? tempF
        : 35.74 +
            0.6215 * tempF -
            35.75 * Math.pow(mag, 0.16) +
            0.4275 * tempF * Math.pow(mag, 0.16);
    }

    if (tempF > 79) {
      const A = -42.379;
      const B = 2.04901523 * tempF;
      const C = 10.14333127 * humidity;
      const D = -0.22475541 * tempF * humidity;
      const E = -0.00683783 * Math.pow(tempF, 2);
      const F = -0.05481717 * Math.pow(humidity, 2);
      const G = 0.00122874 * Math.pow(tempF, 2) * humidity;
      const H = 0.00085282 * tempF * Math.pow(humidity, 2);
      const I = -0.00000199 * Math.pow(tempF, 2) * Math.pow(humidity, 2);

      let heatIndexValue = A + B + C + D + E + F + G + H + I;

      if (humidity < 13 && tempF > 80 && tempF < 112) {
        const adjustment =
          ((13 - humidity) / 4) * Math.sqrt((17 - Math.abs(tempF - 95)) / 17);
        heatIndexValue -= adjustment;
      } else if (humidity > 85 && tempF >= 80 && tempF < 87) {
        const adjustment = ((humidity - 85) / 10) * ((87 - tempF) / 5);
        heatIndexValue += adjustment;
      }

      return heatIndexValue;
    }
    return tempF;
  }

  let hourlyChartData = $derived.by(() => {
    if (!forecastHourly.properties?.periods) {
      return {
        labels: [],
        tempValues: [],
        apparentTempValues: [],
        popValues: [],
      };
    }

    const labels: string[] = [];
    const tempValues: number[] = [];
    const apparentTempValues: number[] = [];
    const popValues: number[] = [];

    const periodsWithAppTemp = forecastHourly.properties.periods.map(
      (period) => {
        const windSpeedValue = parseFloat(period.windSpeed.split(" ")[0]);
        const apparentTemp = calculateApparentTemperature(
          period.temperature,
          period.relativeHumidity.value,
          windSpeedValue,
        );
        return { ...period, appTemp: apparentTemp };
      },
    );

    let count = 0;
    const now = DateTime.now();

    for (let i = 0; i < periodsWithAppTemp.length && count < GRAPH_HOURS; i++) {
      if (now > DateTime.fromISO(periodsWithAppTemp[i].endTime)) {
        continue;
      }

      const period = periodsWithAppTemp[i];
      labels.push(period.startTime);
      tempValues.push(period.temperature);
      popValues.push(period.probabilityOfPrecipitation?.value || 0);
      apparentTempValues.push(Math.round(period.appTemp));
      count++;
    }

    return { labels, tempValues, apparentTempValues, popValues };
  });

  let chartReady = $derived(
    hourlyForecastProcessed && hourlyChartData.labels.length > 0,
  );

  function buildChartConfig(chartData: ChartData) {
    const tempPointRadius = getPointRadius(
      DATASET_CONFIG.TEMPERATURE.defaultPointRadius,
      chartData.labels.length,
    );
    const apparentTempPointRadius = getPointRadius(
      DATASET_CONFIG.APPARENT_TEMPERATURE.defaultPointRadius,
      chartData.labels.length,
    );
    const precipPointRadius = getPointRadius(
      DATASET_CONFIG.PRECIPITATION.defaultPointRadius,
      chartData.labels.length,
    );

    return {
      type: "line" as const,
      data: {
        labels: chartData.labels,
        datasets: [
          {
            label: "Temperature",
            data: chartData.tempValues,
            borderColor: "#D93526",
            backgroundColor: "rgba(217, 53, 38, 0.1)",
            tension: 0.4,
            yAxisID: "y",
            pointRadius: tempPointRadius,
            pointHoverRadius: tempPointRadius + 3,
            pointBackgroundColor: "#D93526",
            pointBorderColor: "#D93526",
            pointBorderWidth: 1,
            borderWidth: 2,
            unit: DATASET_CONFIG.TEMPERATURE.unit,
          },
          {
            label: "Feels Like",
            data: chartData.apparentTempValues,
            borderColor: "#FF9500",
            backgroundColor: "rgba(255, 149, 0, 0.1)",
            tension: 0.4,
            yAxisID: "y",
            pointRadius: apparentTempPointRadius,
            pointHoverRadius: apparentTempPointRadius + 3,
            pointBackgroundColor: "#FF9500",
            pointBorderColor: "#FF9500",
            pointBorderWidth: 1,
            borderWidth: 2,
            unit: DATASET_CONFIG.APPARENT_TEMPERATURE.unit,
          },
          {
            label: "Chance of Precipitation",
            data: chartData.popValues,
            borderColor: "#017FC0",
            backgroundColor: "rgba(1, 127, 192, 0.2)",
            showLine: true,
            fill: true,
            tension: 0.4,
            yAxisID: "y1",
            pointRadius: precipPointRadius,
            pointHoverRadius: precipPointRadius + 3,
            pointBackgroundColor: "#017FC0",
            pointBorderColor: "#017FC0",
            pointBorderWidth: 1,
            borderWidth: 2,
            unit: DATASET_CONFIG.PRECIPITATION.unit,
          },
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
            type: "timeseries",
            time: {
              displayFormats: {
                hour: "ha",
                day: "EEE MMM d",
              },
            },
            grid: {
              display: true,
              color: "rgba(0, 0, 0, 0.05)",
            },
            ticks: {
              maxRotation: 0,
              autoSkipPadding: 10,
            },
          },
          y: {
            type: "linear",
            beginAtZero: false,
            grace: "5%",
            ticks: {
              callback: function (value: number | string) {
                return String(value) + "°";
              },
              padding: 8,
            },
            grid: {
              display: true,
              color: "rgba(0, 0, 0, 0.05)",
            },
            title: {
              display: false,
            },
          },
          y1: {
            type: "linear",
            display: false,
            min: 0,
            max: 100,
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
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            titleColor: "#fff",
            bodyColor: "#fff",
            padding: 12,
            displayColors: true,
            callbacks: {
              title: formatTooltipTitle,
              label: formatTooltipLabel,
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

  function chartAttachment(chartData: ChartData) {
    return (canvas: HTMLCanvasElement) => {
      let instance: Chart | null = null;
      let destroyed = false;

      getChartConstructor()
        .then((ChartCtor) => {
          if (destroyed) return;
          instance = new ChartCtor(canvas, buildChartConfig(chartData));
        })
        .catch(console.error);

      return () => {
        destroyed = true;
        if (instance) {
          instance.destroy();
          instance = null;
        }
      };
    };
  }

  let mapCoords = $derived.by(() => {
    if (!point.properties) return null;
    const lat = parseFloat(page.url.searchParams.get("lat")!);
    const lon = parseFloat(page.url.searchParams.get("lon")!);
    if (isNaN(lat) || isNaN(lon)) return null;
    return { lat, lon };
  });

  function mapAttachment(latitude: number, longitude: number) {
    return (container: HTMLElement) => {
      let mapInstance: import("maplibre-gl").Map | null = null;
      let destroyed = false;
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

      function getStyle() {
        return mediaQuery.matches
          ? "https://tiles.openfreemap.org/styles/dark"
          : "https://tiles.openfreemap.org/styles/positron";
      }

      function handleStyleChange() {
        if (mapInstance && !destroyed) {
          mapInstance.setStyle(getStyle());
        }
      }

      mediaQuery.addEventListener("change", handleStyleChange);

      getMapLibreModule()
        .then((maplibregl) => {
          if (destroyed) return;

          mapInstance = new maplibregl.Map({
            container,
            style: getStyle(),
            center: [longitude, latitude],
            zoom: 7,
            interactive: false,
          });

          mapInstance.on("load", () => {
            if (!mapInstance || destroyed) return;

            mapInstance.addSource("nws_radar", {
              type: "raster",
              tiles: [
                "https://mapservices.weather.noaa.gov/eventdriven/services/radar/radar_base_reflectivity/MapServer/WMSServer?bbox={bbox-epsg-3857}&format=image/png&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&transparent=true&styles=default&width=256&height=256&layers=1",
              ],
              tileSize: 256,
            });

            mapInstance.addLayer({
              id: "nws_radar",
              type: "raster",
              source: "nws_radar",
              paint: {},
            });
          });
        })
        .catch(console.error);

      return () => {
        destroyed = true;
        mediaQuery.removeEventListener("change", handleStyleChange);
        if (mapInstance) {
          mapInstance.remove();
          mapInstance = null;
        }
      };
    };
  }

  async function processWeather(
    latitude: number,
    longitude: number,
  ): Promise<void> {
    try {
      point = await fetchData(
        `https://api.weather.gov/points/${latitude},${longitude}`,
      );

      if (!point.properties) {
        throw new Error("Invalid location data received");
      }

      const [hourlyForecastData, weeklyForecastData] = await Promise.all([
        fetchData(point.properties.forecastHourly || ""),
        fetchData(point.properties.forecast || ""),
      ]);

      forecastHourly = hourlyForecastData;
      forecast = weeklyForecastData;

      hourlyForecastProcessed = true;

      processForecastEmojis(forecast);

      NWSURL = `https://forecast.weather.gov/MapClick.php?lat=${latitude}&lon=${longitude}`;

      fetchAlertsAsync(latitude, longitude);
    } catch (error) {
      console.error("Error in processWeather:", error);
      throw error;
    } finally {
      isLoading = false;
    }
  }

  async function fetchAlertsAsync(
    latitude: number,
    longitude: number,
  ): Promise<void> {
    try {
      const alertsData = await fetchData(
        `https://api.weather.gov/alerts/active?status=actual&message_type=alert,update&point=${latitude},${longitude}`,
      );
      alerts = alertsData;
      processAlertSeverity(alerts);
    } catch (error) {
      console.error("Error fetching alerts:", error);
    }
  }

  {
    const lat = page.url.searchParams.get("lat");
    const lon = page.url.searchParams.get("lon");

    if (!lat || !lon) {
      geolocationError = "No location provided. Please go back and try again.";
      isLoading = false;
    } else {
      const latitude = parseFloat(lat);
      const longitude = parseFloat(lon);

      if (isNaN(latitude) || isNaN(longitude)) {
        geolocationError =
          "Invalid location coordinates. Please go back and try again.";
        isLoading = false;
      } else {
        isLoading = true;

        processWeather(latitude, longitude).catch((error) => {
          console.error("Error processing weather data:", error);
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
      }
    }
  }
</script>

<svelte:boundary>
  <div class="container-fluid">
    <h1 style="text-align: center;">
      {locationDisplay}
    </h1>

    <div id="alerts">
      {#if alerts.features?.length}
        {#snippet alertItem(alert: WeatherAlert["features"][number])}
          <details>
            <!-- svelte-ignore a11y_no_redundant_roles -->
            <summary
              role="button"
              style="text-align: center;"
              class={alert.properties.severity}
            >
              {alert.properties.event}
            </summary>
            <p>{alert.properties.description}</p>
            <p>{alert.properties.instruction}</p>
          </details>
        {/snippet}
        {#each alerts.features as alert (alert.properties.event + "-" + (alert.properties.effective || ""))}
          {@render alertItem(alert)}
        {/each}
      {/if}
    </div>

    <div style="height: 300px; margin: 20px 0;">
      <canvas id="myChart" {@attach chartReady && chartAttachment(hourlyChartData)}></canvas>
    </div>

    <div id="grid">
      {#if forecast.properties?.periods}
        {#snippet forecastRow(period: WeatherPeriod)}
          <tr>
            <td>
              <b>{period.name}</b><br />{period.shortForecast}
              {#if period.isDaytime}
                <span class="pico-color-red-500">{period.temperature}</span>
              {:else}
                <span class="pico-color-azure-500">{period.temperature}</span>
              {/if}
            </td>
            <td>{period.detailedForecast}</td>
          </tr>
        {/snippet}
        <table class="striped">
          <tbody>
            {#each forecast.properties.periods as period (period.name)}
              {@render forecastRow(period)}
            {/each}
          </tbody>
        </table>
      {:else if showLoading}
        <span aria-busy="true">Fetching weather data...</span>
      {/if}
    </div>

    <div>
      <div
        id="map"
        style="min-width: 100%; min-height: 50vh; position: relative"
        {@attach mapCoords && mapAttachment(mapCoords.lat, mapCoords.lon)}
      ></div>
    </div>
    <br />

    {#if NWSURL}
      <div style="text-align: center;">
        <a href={NWSURL}><button>Weather.gov forecast</button></a>
      </div>
    {/if}
    <br />

    <p style="text-align: center;">
      This forecast is generated from the U.S. National Weather Service's
      <a href="https://www.weather.gov/documentation/services-web-api"
        >weather.gov API</a
      >
      using this
      <a href="https://github.com/jquagga/swa">Simple Weather App</a>.
    </p>
  </div>

  {#snippet failed(error, reset)}
    <div style="text-align: center; padding: 20px;">
      <p style="color: red;">An error occurred: {(error as Error).message}</p>
      <button onclick={reset}>Try Again</button>
    </div>
  {/snippet}
</svelte:boundary>
