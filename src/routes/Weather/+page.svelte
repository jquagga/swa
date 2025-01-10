<script lang="ts">
  import { onMount } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import Chart from "chart.js/auto";
  import "chartjs-adapter-luxon";

  let point: any = [];
  let alerts: any = [];
  let forecast: any = [];
  let forecastHourly: any = [];
  let NWSURL: string = "";
  let map: any;

  onMount(() => {
    const options = {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 3600,
    };
    globalThis.navigator.geolocation.getCurrentPosition(
      success,
      error,
      options
    );
  });

  async function success(pos: {
    coords: { latitude: number; longitude: number };
  }) {
    await process_weather(
      pos.coords.latitude.toFixed(4),
      pos.coords.longitude.toFixed(4)
    );
  }

  async function error(_error: unknown) {
    throw new Error("Exiting");
  }

  async function process_weather(latitude: number, longitude: number) {
    const headers = {
      accept: "application/geo+json",
      "user-agent": "https://github.com/jquagga/swa",
    };

    const point_response = await fetch(
      `https://api.weather.gov/points/${latitude},${longitude}`,
      {
        headers,
      }
    );
    point = await point_response.json();

    const alerts_response = await fetch(
      `https://api.weather.gov/alerts/active?status=actual&message_type=alert,update&point=${latitude},${longitude}&limit=50`,
      { headers }
    );
    alerts = await alerts_response.json();

    // TODO - add a for loop to switch out Extreme and Severe to these picocss classes to make red / yellow
    //{#if alert.properties.severity == "Extreme"}pico-background-red-500"{:else if alert.properties.severity == "Severe"}"pico-background-yellow-100"{:else}"primary"{/if}

    const forecastHourly_response = await fetch(
      point.properties.forecastHourly,
      {
        headers,
      }
    );
    forecastHourly = await forecastHourly_response.json();

    const forecast_response = await fetch(point.properties.forecast, {
      headers,
    });
    forecast = await forecast_response.json();

    // Start of hourly chart - for loop to build data arrays for chart
    let labels = [];
    let temp_values = [];
    let pop_values = [];
    //let length = forecastHourly.properties.periods.length;
    for (let i = 0; i < 25; i++) {
      labels.push(forecastHourly.properties.periods[i].startTime);
      temp_values.push(forecastHourly.properties.periods[i].temperature);
      pop_values.push(
        forecastHourly.properties.periods[i].probabilityOfPrecipitation.value
      );
    }

    const context = document.querySelector("#myChart");
    new Chart(context, {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Temperature",
            data: temp_values,
            borderColor: "#FF0000",
            backgroundColor: "#FF0000",
            //showLine: false,
            tension: 0.4,
            yAxisID: "y",
            pointRadius: 0,
          },
          {
            label: "Chance of Precipitation",
            data: pop_values,
            borderColor: "#add8e6",
            backgroundColor: "#add8e6",
            showLine: true,
            fill: true,
            tension: 0.4,
            yAxisID: "y1",
            pointRadius: 0,
          },
        ],
      },
      options: {
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

    // Builds URL variable for footer
    NWSURL = `https://forecast.weather.gov/MapClick.php?lat=${latitude}&lon=${longitude}`;

    // And this builds the radar map for bottom of the page
    map = new maplibregl.Map({
      container: "map",
      style: "https://tiles.openfreemap.org/styles/positron",
      center: [longitude, latitude],
      zoom: 7,
      // Causes pan & zoom handlers not to be applied, similar to
      // .dragging.disable() and other handler .disable() functions in Leaflet.
      interactive: false,
    });

    const marker = new maplibregl.Marker()
      .setLngLat([longitude, latitude])
      .addTo(map);

    map.on("load", () => {
      map.addSource("nws_radar", {
        type: "raster",
        // Use the tiles option to specify a WMS tile source URL
        // https://maplibre.org/maplibre-style-spec/sources/
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
</script>

<div class="container">
  <h1 style="text-align: center;">
    {#if point.hasOwnProperty("properties")}
      {point.properties.relativeLocation.properties.city}, {point.properties
        .relativeLocation.properties.state}
    {/if}
  </h1>

  <div id="alerts">
    {#if alerts.hasOwnProperty("features") && alerts["features"].length}
      <details>
        {#each alerts.features as alert}
          <!-- svelte-ignore a11y_no_redundant_roles -->
          <summary role="button" class="primary">
            {alert.properties.parameters.NWSheadline}</summary
          >
          <p>{alert.properties.description}</p>
          <p>{alert.properties.instruction}</p>
        {/each}
      </details>
    {/if}
  </div>

  <canvas id="myChart"></canvas>

  <div id="grid">
    {#if forecast.hasOwnProperty("properties")}
      <div class="container">
        <table class="striped">
          <tbody>
            {#each forecast.properties.periods as period}
              <tr>
                <td><b>{period.name}</b></td>
                <td>{period.detailedForecast}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <span aria-busy="true">Fetching Weather Data...</span>
    {/if}
  </div>

  <div>
    <div
      id="map"
      style="min-width: 100%; min-height: 50vh; position: relative"
    ></div>
  </div>
  <br />

  <div style="text-align: center;">
    <a href={NWSURL}><button>Weather.gov forecast</button></a>
  </div>
  <br />
  <p style="text-align: center;">
    This forecast is generated from the U.S. National Weather Service's <a
      href="https://www.weather.gov/documentation/services-web-api"
      >weather.gov API</a
    >
    using this <a href="https://github.com/jquagga/swa">Simple Weather App</a>.
  </p>
</div>
