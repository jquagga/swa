<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import Chart from "chart.js/auto";
  import "chartjs-adapter-luxon";
  import { DateTime } from "luxon";

  // Type definitions for better type safety
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

  // State variables with proper typing
  let point = $state<WeatherPoint>({});
  let alerts = $state<WeatherAlert>({ features: [] });
  let forecast = $state<ForecastData>({});
  let forecastHourly = $state<ForecastData>({});
  let NWSURL = $state("");
  let map: maplibregl.Map | null = null;
  let geolocationError = $state<string | null>(null);
  let isLoading = $state(true);
  let chartInstance: Chart | null = null;

  // Constants
  const MAX_RETRIES = 3;
  const GRAPH_HOURS = 25;
  const USER_AGENT = "https://github.com/jquagga/swa";

  // Weather emoji mapping for cleaner code
  const weatherEmojiMap: Record<string, string> = {
    snow: "❄️",
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

  // On mount, get geolocation
  onMount(() => {
    const options = {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 3600,
    };
    navigator.geolocation.getCurrentPosition(success, error, options);

    // Cleanup function
    return () => {
      if (map) {
        map.remove();
        map = null;
      }
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }
    };
  });

  async function success(pos: GeolocationPosition) {
    isLoading = true;
    try {
      await processWeather(
        Math.round(pos.coords.latitude * 10000) / 10000,
        Math.round(pos.coords.longitude * 10000) / 10000
      );
    } catch (error) {
      console.error("Error processing weather data:", error);
      // Provide more specific error messages based on the error type
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
    } finally {
      isLoading = false;
    }
  }

  function error(error: GeolocationPositionError) {
    isLoading = false;
    const errorMessages: Record<number, string> = {
      1: "Please enable location access to see your local forecast.",
      2: "Unable to determine your location. Please try again.",
      3: "Location request timed out. Please try again.",
    };

    geolocationError =
      errorMessages[error.code] ||
      "Unable to get your location. Please try again.";
  }

  // Simple cache implementation for API responses
  const apiCache = new Map<string, { data: any; timestamp: number }>();
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  async function fetchData(url: string, useCache = true): Promise<any> {
    // Check cache first if enabled
    if (useCache) {
      const cached = apiCache.get(url);
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
      }
    }

    const headers = {
      accept: "application/geo+json",
      "user-agent": USER_AGENT,
    };

    let retryCount = 0;
    let lastError: Error | null = null;

    while (retryCount < MAX_RETRIES) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(url, {
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Cache the response
        if (useCache) {
          apiCache.set(url, { data, timestamp: Date.now() });
        }

        return data;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        retryCount++;

        if (retryCount >= MAX_RETRIES) {
          break;
        }

        // Exponential backoff with jitter
        const baseDelay = 1000 * Math.pow(2, retryCount);
        const jitter = Math.random() * 0.3 * baseDelay; // Add up to 30% jitter
        const delay = baseDelay + jitter;

        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error("Unknown error occurred during fetch");
  }

  // Process alert severity with cleaner code
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

  // Map weather description to emoji
  function mapWeatherToEmoji(description: string): string {
    const lowerDesc = description.toLowerCase();
    for (const [key, emoji] of Object.entries(weatherEmojiMap)) {
      if (lowerDesc.includes(key)) {
        return emoji;
      }
    }
    return description; // Return original if no match found
  }

  // Process forecast periods to add emojis
  function processForecastEmojis(forecast: ForecastData): void {
    if (!forecast.properties?.periods) return;

    forecast.properties.periods.forEach((period) => {
      period.shortForecast = mapWeatherToEmoji(period.shortForecast);
    });
  }

  // Calculate apparent temperature
  function calculateApparentTemperature(
    tempF: number,
    humidity: number,
    windSpeedMph: number
  ): number {
    // Taken right from NWS CAVE and converted to JS
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

      // Apply adjustment for low humidities
      if (humidity < 13 && tempF > 80 && tempF < 112) {
        const adjustment =
          ((13 - humidity) / 4) * Math.sqrt((17 - Math.abs(tempF - 95)) / 17);
        heatIndexValue -= adjustment;
      }
      // Apply adjustment for high humidities
      else if (humidity > 85 && tempF >= 80 && tempF < 87) {
        const adjustment = ((humidity - 85) / 10) * ((87 - tempF) / 5);
        heatIndexValue += adjustment;
      }

      return heatIndexValue;
    }
    return tempF;
  }

  // Process hourly forecast data for chart
  function processHourlyForecast(forecastHourly: ForecastData): {
    labels: string[];
    tempValues: number[];
    apparentTempValues: number[];
    popValues: number[];
  } {
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

    let periods = [...forecastHourly.properties.periods];

    for (let i = 0; i < GRAPH_HOURS && i < periods.length; i++) {
      // Skip past periods
      if (DateTime.now() > DateTime.fromISO(periods[i].endTime)) {
        periods = periods.slice(1);
        i--; // Reset the loop counter
        continue;
      }

      const period = periods[i];
      labels.push(period.startTime);
      tempValues.push(period.temperature);
      popValues.push(period.probabilityOfPrecipitation?.value || 0);

      // Parse wind speed
      const windSpeedValue = parseFloat(period.windSpeed.split(" ")[0]);

      // Calculate apparent temperature
      const apparentTemp = calculateApparentTemperature(
        parseFloat(period.temperature),
        period.relativeHumidity.value,
        windSpeedValue
      );

      // Store the calculated apparent temperature
      period.appTemp = apparentTemp;
      apparentTempValues.push(Math.round(apparentTemp));
    }

    return { labels, tempValues, apparentTempValues, popValues };
  }

  // Create the temperature chart
  function createChart(
    canvasElement: HTMLCanvasElement,
    chartData: {
      labels: string[];
      tempValues: number[];
      apparentTempValues: number[];
      popValues: number[];
    }
  ): void {
    // Destroy existing chart if it exists
    if (chartInstance) {
      chartInstance.destroy();
    }

    chartInstance = new Chart(canvasElement, {
      type: "line",
      data: {
        labels: chartData.labels,
        datasets: [
          {
            label: "Temperature",
            data: chartData.tempValues,
            borderColor: "#D93526",
            backgroundColor: "#D93526",
            tension: 0.4,
            yAxisID: "y",
            pointRadius: 0,
          },
          {
            label: "Apparent Temperature",
            data: chartData.apparentTempValues,
            borderColor: "#FF9500",
            backgroundColor: "#FF9500",
            tension: 0.4,
            yAxisID: "y",
            pointRadius: 0,
            borderDash: [5, 5],
          },
          {
            label: "Chance of Precipitation",
            data: chartData.popValues,
            borderColor: "#017FC0",
            backgroundColor: "#017FC0",
            showLine: true,
            fill: true,
            tension: 0.4,
            yAxisID: "y1",
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
          x: {
            type: "timeseries",
          },
          y: {
            type: "linear",
            beginAtZero: false,
            grace: "5%",
          },
          y1: {
            type: "linear",
            display: false,
            position: "right",
            min: 0,
            max: 100,
            grid: {
              drawOnChartArea: false,
            },
          },
        },
        plugins: {
          legend: {
            display: true,
            position: "bottom",
            align: "start",
            labels: {
              usePointStyle: true,
            },
          },
        },
      },
    });
  }

  // Initialize the map
  function initializeMap(latitude: number, longitude: number): void {
    // Check if map already exists and remove it
    if (map) {
      map.remove();
    }

    // Determine map style based on color scheme preference
    const isDarkMode =
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const mapStyle = isDarkMode
      ? "https://tiles.openfreemap.org/styles/dark"
      : "https://tiles.openfreemap.org/styles/positron";

    map = new maplibregl.Map({
      container: "map",
      style: mapStyle,
      center: [longitude, latitude],
      zoom: 7,
      interactive: false,
    });

    map.on("load", () => {
      if (!map) return;

      map.addSource("nws_radar", {
        type: "raster",
        tiles: [
          "https://mapservices.weather.noaa.gov/eventdriven/services/radar/radar_base_reflectivity/MapServer/WMSServer?bbox={bbox-epsg-3857}&format=image/png&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&transparent=true&styles=default&width=256&height=256&layers=1",
        ],
        tileSize: 256,
      });

      map.addLayer({
        id: "nws_radar",
        type: "raster",
        source: "nws_radar",
        paint: {},
      });
    });
  }

  // Main function to process all weather data
  async function processWeather(
    latitude: number,
    longitude: number
  ): Promise<void> {
    try {
      // Get location data first (required for other calls)
      point = await fetchData(
        `https://api.weather.gov/points/${latitude},${longitude}`
      );

      if (!point.properties) {
        throw new Error("Invalid location data received");
      }

      // Parallel fetch independent data
      const [alertsData, hourlyForecastData, weeklyForecastData] =
        await Promise.all([
          fetchData(
            `https://api.weather.gov/alerts/active?status=actual&message_type=alert,update&point=${latitude},${longitude}`
          ),
          fetchData(point.properties.forecastHourly || ""),
          fetchData(point.properties.forecast || ""),
        ]);

      // Process the fetched data
      alerts = alertsData;
      processAlertSeverity(alerts);

      forecastHourly = hourlyForecastData;
      forecast = weeklyForecastData;

      // Process hourly data for chart
      const chartData = processHourlyForecast(forecastHourly);

      // Create chart after DOM is ready
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const canvasElement = document.querySelector(
        "#myChart"
      ) as HTMLCanvasElement;
      if (canvasElement) {
        createChart(canvasElement, chartData);
      }

      // Process forecast emojis
      processForecastEmojis(forecast);

      // Initialize map
      initializeMap(latitude, longitude);

      // Build NWS URL
      NWSURL = `https://forecast.weather.gov/MapClick.php?lat=${latitude}&lon=${longitude}`;
    } catch (error) {
      console.error("Error in processWeather:", error);
      throw error; // Re-throw to be caught by the caller
    }
  }
</script>

<div class="container">
  <h1 style="text-align: center;">
    {#if geolocationError}
      {geolocationError}
    {:else if point.detail}
      The weather.gov API has returned an error: <br />{point.detail}
    {:else if point.properties?.relativeLocation?.properties}
      {point.properties.relativeLocation.properties.city}, {point.properties
        .relativeLocation.properties.state}
    {:else if isLoading}
      <span aria-busy="true">Geolocating...</span>
    {:else}
      <span>Loading weather data...</span>
    {/if}
  </h1>

  <div id="alerts">
    {#if alerts.features?.length}
      {#each alerts.features as alert (alert.properties.event)}
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
      {/each}
    {/if}
  </div>

  <div id="currently">
    {#if forecastHourly.properties?.periods?.[0]?.appTemp}
      <h4 style="text-align: center;">
        {forecastHourly.properties.periods[0].shortForecast}, {forecastHourly
          .properties.periods[0].temperature}
        {forecastHourly.properties.periods[0].temperatureUnit}

        {#if forecastHourly.properties.periods[0].temperature !== Math.round(forecastHourly.properties.periods[0].appTemp)}
          <br />Feels Like: {Math.round(
            forecastHourly.properties.periods[0].appTemp
          )}
          {forecastHourly.properties.periods[0].temperatureUnit}
        {/if}
      </h4>
    {:else if !isLoading && point.properties}
      <h4 style="text-align: center;">Loading current conditions...</h4>
    {/if}
  </div>

  <div style="height: 300px; margin: 20px 0;">
    <canvas id="myChart"></canvas>
  </div>

  <div id="grid">
    {#if forecast.properties?.periods}
      <table class="striped">
        <tbody>
          {#each forecast.properties.periods as period (period.name)}
            <tr>
              <td>
                <b>{period.name}</b><br />{period.shortForecast}
                <!-- Daytime = Red/Hi, Night = Blue/Low -->
                {#if period.isDaytime}
                  <span class="pico-color-red-500">{period.temperature}</span>
                {:else}
                  <span class="pico-color-azure-500">{period.temperature}</span>
                {/if}
              </td>
              <td>{period.detailedForecast}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else if !isLoading && point.properties}
      <span aria-busy="true">Fetching weather data...</span>
    {/if}
  </div>

  <div>
    <div
      id="map"
      style="min-width: 100%; min-height: 50vh; position: relative"
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
    using this <a href="https://github.com/jquagga/swa">Simple Weather App</a>.
  </p>
</div>
