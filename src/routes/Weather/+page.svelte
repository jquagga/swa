<script lang="ts">
  import { onMount } from "svelte";
  import maplibregl from "maplibre-gl";
  import "maplibre-gl/dist/maplibre-gl.css";
  import Chart from "chart.js/auto";
  import "chartjs-adapter-luxon";

  let point: any = $state([]);
  let alerts: any = $state([]);
  let forecast: any = $state([]);
  let forecastHourly: any = $state([]);
  let NWSURL: string = $state("");
  let map: any = "";
  let geolocationError: string | null = $state(null);

  // On mount, let's get our geolocation so we can get the weather.
  onMount(() => {
    const options = {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 3600,
    };
    navigator.geolocation.getCurrentPosition(success, error, options);
  });

  async function success(pos: {
    coords: { latitude: number; longitude: number };
  }) {
    await process_weather(
      pos.coords.latitude.toFixed(4),
      pos.coords.longitude.toFixed(4)
    );
  }

  async function error(error: GeolocationPositionError) {
    const errorMessages = {
      PERMISSION_DENIED:
        "Please enable location access to see your local forecast.",
      POSITION_UNAVAILABLE:
        "Unable to determine your location. Please try again.",
      TIMEOUT: "Location request timed out. Please try again.",
    };

    geolocationError =
      errorMessages[error.code] ||
      "Unable to get your location. Please try again.";
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

    // This for loop switches the severity of an alert to the associated picocss
    // class.  Severe is yellow and Extreme is red.  Otherwise primary.
    for (let i = 0; i < alerts.features.length; i++) {
      //console.log(alerts.features[i].properties.severity);
      if (alerts.features[i].properties.severity == "Severe") {
        alerts.features[i].properties.severity = "pico-background-yellow-100";
      } else if (alerts.features[i].properties.severity == "Extreme") {
        alerts.features[i].properties.severity = "pico-background-red-500";
      } else {
        alerts.features[i].properties.severity = "primary";
      }
    }

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
    let apptemp_values = [];
    let pop_values = [];
    //const GRAPH_HOURS = forecastHourly.properties.periods.length;
    const GRAPH_HOURS = 25;
    for (let i = 0; i < GRAPH_HOURS; i++) {
      labels.push(forecastHourly.properties.periods[i].startTime);
      temp_values.push(forecastHourly.properties.periods[i].temperature);
      pop_values.push(
        forecastHourly.properties.periods[i].probabilityOfPrecipitation.value
      );

      // We have to chop "mph" off of the windspeed to make it just a number
      const windspeed: unknown =
        forecastHourly.properties.periods[i].windSpeed.split(" ");
      forecastHourly.properties.periods[i].windSpeed = Number.parseFloat(
        windspeed[0] // windspeed is always 0 here; 1 is the "mph"
      );
      // Now we send the period off to apptemp to create apptemp!
      forecastHourly.properties.periods[i].appTemp = apptempF(
        Number.parseFloat(forecastHourly.properties.periods[i].temperature),
        Number.parseFloat(
          forecastHourly.properties.periods[i].relativeHumidity.value
        ),
        forecastHourly.properties.periods[i].windSpeed
      );
      apptemp_values.push(forecastHourly.properties.periods[i].appTemp);
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
            borderColor: "#D93526",
            backgroundColor: "#D93526",
            //showLine: false,
            tension: 0.4,
            yAxisID: "y",
            pointRadius: 0,
          },
          {
            label: "Apparent Temperature",
            data: apptemp_values,
            borderColor: "#FF9500",
            backgroundColor: "#FF9500",
            //showLine: false,
            tension: 0.4,
            yAxisID: "y",
            pointRadius: 0,
            borderDash: [5, 5],
          },
          {
            label: "Chance of Precipitation",
            data: pop_values,
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

  function apptempF(T_F: number, rh: number, ws_mph: number) {
    // Taken right from NWS CAVE and converted to JS:
    // cave/com.raytheon.viz.gfe/localization/gfe/userPython/smartTools/ApparentTemperature.py
    if (T_F <= 51) {
      const mag = ws_mph * 1.15;
      return mag <= 3
        ? T_F
        : 35.74 +
            0.6215 * T_F -
            35.75 * mag ** 0.16 +
            0.4275 * T_F * mag ** 0.16;
    }

    if (T_F > 79) {
      const A = -42.379;
      const B = 2.049_015_23 * T_F;
      const C = 10.143_331_27 * rh;
      const D = -0.224_755_41 * T_F * rh;
      const E = -0.006_837_83 * T_F ** 2;
      const F = -0.054_817_17 * rh ** 2;
      const G = 0.001_228_74 * T_F ** 2 * rh;
      const H = 0.000_852_82 * T_F * rh ** 2;
      const I = -0.000_001_99 * T_F ** 2 * rh ** 2;

      let HeatIndexValue = A + B + C + D + E + F + G + H + I;

      // Apply an adjustment for low humidities
      if (rh < 13 && T_F > 80 && T_F < 112) {
        const adjustment =
          ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(T_F - 95)) / 17);
        HeatIndexValue -= adjustment;
        // Apply an adjustment for high humidities
      } else if (rh > 85 && T_F >= 80 && T_F < 87) {
        const adjustment = ((rh - 85) / 10) * ((87 - T_F) / 5);
        HeatIndexValue += adjustment;
      }

      return HeatIndexValue;
    } else return T_F;
  }
</script>

<div class="container">
  <h1 style="text-align: center;">
    {#if geolocationError}
      {geolocationError}
    {:else if point.hasOwnProperty("properties")}
      {point.properties.relativeLocation.properties.city}, {point.properties
        .relativeLocation.properties.state}
    {:else}
      <span aria-busy="true">Geolocating...</span>
    {/if}
  </h1>

  <div id="alerts">
    {#if alerts.hasOwnProperty("features") && alerts["features"].length}
      {#each alerts.features as alert}
        <details>
          <!-- svelte-ignore a11y_no_redundant_roles -->
          <summary role="button" class={alert.properties.severity}>
            {alert.properties.parameters.NWSheadline}</summary
          >
          <p>{alert.properties.description}</p>
          <p>{alert.properties.instruction}</p>
        </details>
      {/each}
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
    {:else if point.hasOwnProperty("properties")}
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
