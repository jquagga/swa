/* eslint-disable no-unused-vars */
// Chart.js support libraries
import Chart from "chart.js/auto";
import ChartDataLabels from "chartjs-plugin-datalabels";
import "chartjs-adapter-luxon";

import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Pull to refresh as ios breaks it for PWA
import PullToRefresh from "pulltorefreshjs";
const ptr = PullToRefresh.init({
  mainElement: "body",
  onRefresh() {
    window.location.reload();
  },
});

async function main(latitude, longitude) {
  const headers = {
    accept: "application/ld+json",
    "user-agent": "https://github.com/jquagga/swa",
  };

  const point_response = await fetch(
    `https://api.weather.gov/points/${latitude},${longitude}`,
    { headers }
  );
  const point = await point_response.json();

  const alerts_response = await fetch(
    `https://api.weather.gov/alerts?active=true&status=actual&message_type=alert,update&point=${latitude},${longitude}&limit=50`,
    { headers }
  );
  const alerts = await alerts_response.json();

  const forecast_response = await fetch(point.forecast, { headers });
  const forecast = await forecast_response.json();

  const forecastHourly_response = await fetch(point.forecastHourly, {
    headers,
  });
  const forecastHourly = await forecastHourly_response.json();

  document.querySelector("#header").innerHTML = await build_header(point);
  document.querySelector("#alerts").innerHTML = await alert_processing(alerts);
  document.querySelector("#grid").innerHTML = await build_grid(forecast);
  await build_chart(forecastHourly);
  await build_map(latitude, longitude);
  document.querySelector(
    "#footer"
  ).innerHTML = `<div class="text-center"><a href=https://forecast.weather.gov/MapClick.php?lat=${latitude}&lon=${longitude}
        class="link-primary"><button type="button" class="btn btn-primary">Weather.gov forecast</button></a></div>
<p class="text-center">This forecast is generated from the U.S. National Weather Service's <a
        href="https://www.weather.gov/documentation/services-web-api">weather.gov API</a>
    using this <a href="https://github.com/jquagga/swa">Simple Weather App</a>.</p>`;
}

async function build_header(point) {
  const headertxt = `
    <div class="container">
      <h1>
        Weather for ${point.relativeLocation.city},
        ${point.relativeLocation.state}
      </h1>
    </div>
    `;
  return headertxt;
}

async function alert_processing(alerts) {
  const severity_classes = {
    Extreme: "danger",
    Severe: "warning",
    default: "info",
  };

  let alert_string = "";
  for (const alert of alerts["@graph"]) {
    const alert_class =
      severity_classes[alert.severity] || severity_classes["default"];
    alert_string += `
        <div class="alert alert-${alert_class}" role="alert">
            <h2 class="alert-heading"><a class="alert-link" data-bs-toggle="collapse" href="#collapse${alert.id}">
            ${alert.event}</a></h2>
            <div class="collapse" id="collapse${alert.id}">
            <hr>
            <p>${alert.parameters.NWSheadline}</p>
            <p>${alert.description}</p>
            <p>${alert.instruction}</p>
            </div>
        </div>
        `;
  }

  return alert_string;
}

async function build_chart(forecastHourly) {
  for (let i = 0; i < 8; i++) {
    // We have to chop "mph" off of the windspeed to make it just a number
    const windspeed = forecastHourly.periods[i].windSpeed.split(" ");
    forecastHourly.periods[i].windSpeed = Number.parseFloat(windspeed[0]);
    // Now we send the period off to apptemp to create apptemp!
    forecastHourly.periods[i].appTemp = apptempF(
      Number.parseFloat(forecastHourly.periods[i].temperature),
      Number.parseFloat(forecastHourly.periods[i].relativeHumidity.value),
      forecastHourly.periods[i].windSpeed
    );
  }

  Chart.register(ChartDataLabels);
  const context = document.querySelector("#myChart");
  new Chart(context, {
    type: "line",
    data: {
      labels: [
        forecastHourly.periods[0].startTime,
        forecastHourly.periods[1].startTime,
        forecastHourly.periods[2].startTime,
        forecastHourly.periods[3].startTime,
        forecastHourly.periods[4].startTime,
        forecastHourly.periods[5].startTime,
        forecastHourly.periods[6].startTime,
        forecastHourly.periods[7].startTime,
      ],
      datasets: [
        {
          label: "Temperature",
          data: [
            forecastHourly.periods[0].temperature,
            forecastHourly.periods[1].temperature,
            forecastHourly.periods[2].temperature,
            forecastHourly.periods[3].temperature,
            forecastHourly.periods[4].temperature,
            forecastHourly.periods[5].temperature,
            forecastHourly.periods[6].temperature,
            forecastHourly.periods[7].temperature,
          ],
          borderColor: "#FF0000",
          backgroundColor: "#FF0000",
          showLine: false,
          yAxisID: "y",
        },
        {
          label: "Apparent Temperature",
          data: [
            forecastHourly.periods[0].appTemp,
            forecastHourly.periods[1].appTemp,
            forecastHourly.periods[2].appTemp,
            forecastHourly.periods[3].appTemp,
            forecastHourly.periods[4].appTemp,
            forecastHourly.periods[5].appTemp,
            forecastHourly.periods[6].appTemp,
            forecastHourly.periods[7].appTemp,
          ],
          borderColor: "#a40000",
          backgroundColor: "#a40000",
          showLine: false,
          yAxisID: "y",
        },
        {
          label: "Chance of Precipitation",
          data: [
            forecastHourly.periods[0].probabilityOfPrecipitation.value,
            forecastHourly.periods[1].probabilityOfPrecipitation.value,
            forecastHourly.periods[2].probabilityOfPrecipitation.value,
            forecastHourly.periods[3].probabilityOfPrecipitation.value,
            forecastHourly.periods[4].probabilityOfPrecipitation.value,
            forecastHourly.periods[5].probabilityOfPrecipitation.value,
            forecastHourly.periods[6].probabilityOfPrecipitation.value,
            forecastHourly.periods[7].probabilityOfPrecipitation.value,
          ],
          borderColor: "#add8e6",
          backgroundColor: "#add8e6",
          showLine: true,
          fill: true,
          yAxisID: "y1",
          pointRadius: 0,
          datalabels: {
            display: false,
          },
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
        datalabels: {
          backgroundColor(context) {
            return context.dataset.backgroundColor;
          },
          borderRadius: 25,
          borderWidth: 2,
          color: "white",
          font: {
            weight: "bold",
          },
          formatter: Math.round,
          padding: 2,
          display: "auto",
        },
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

async function build_grid(forecast) {
  return `
 <table class="table table-striped">
    <tbody>
        <tr>
            <td><b>${forecast.periods[0].name}</b></td>
            <td>${forecast.periods[0].detailedForecast}</td>
        </tr>
        <td><b>${forecast.periods[1].name}</b></td>
        <td>${forecast.periods[1].detailedForecast}</td>
        </tr>
        <tr>
            <td><b>${forecast.periods[2].name}</b></td>
            <td>${forecast.periods[2].detailedForecast}</td>
        </tr>
        <tr>
            <td><b>${forecast.periods[3].name}</b></td>
            <td>${forecast.periods[3].detailedForecast}</td>
        </tr>
        <tr>
            <td><b>${forecast.periods[4].name}</b></td>
            <td>${forecast.periods[4].detailedForecast}</td>
        </tr>
        <tr>
            <td><b>${forecast.periods[5].name}</b></td>
            <td>${forecast.periods[5].detailedForecast}</td>
        </tr>
    </tbody>
</table>
    `;
}

async function build_map(latitude, longitude) {
  const map = new maplibregl.Map({
    container: "map",
    style: "https://tiles.openfreemap.org/styles/positron",
    center: [longitude, latitude],
    zoom: 7,
    // causes pan & zoom handlers not to be applied, similar to
    // .dragging.disable() and other handler .disable() functions in Leaflet.
    interactive: false,
  });

  const marker = new maplibregl.Marker()
    .setLngLat([longitude, latitude])
    .addTo(map);

  map.on("load", () => {
    map.addSource("nws_radar", {
      type: "raster",
      // use the tiles option to specify a WMS tile source URL
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

/* In this case Apparent Temperature uses the NOAA WindChill calculation
  if it's below 50F and Heat Index if it's over 80.  That approximates
  what the weather.gov site displays.
*/
function apptempF(T_F, rh, ws_mph) {
  // Taken right from NWS CAVE and converted to JS:
  // cave/com.raytheon.viz.gfe/localization/gfe/userPython/smartTools/ApparentTemperature.py
  if (T_F <= 51) {
    const mag = ws_mph * 1.15;
    const WindChillValue =
      mag <= 3
        ? T_F
        : 35.74 +
          0.6215 * T_F -
          35.75 * mag ** 0.16 +
          0.4275 * T_F * mag ** 0.16;
    return WindChillValue;
  } else if (T_F > 79) {
    const A = -42.379;
    const B = 2.04901523 * T_F;
    const C = 10.14333127 * rh;
    const D = -0.22475541 * T_F * rh;
    const E = -0.00683783 * T_F ** 2;
    const F = -0.05481717 * rh ** 2;
    const G = 0.00122874 * T_F ** 2 * rh;
    const H = 0.00085282 * T_F * rh ** 2;
    const I = -0.00000199 * T_F ** 2 * rh ** 2;

    let HeatIndexValue = A + B + C + D + E + F + G + H + I;

    // Apply an adjustment for low humidities
    if (rh < 13 && T_F > 80 && T_F < 112) {
      let adjustment =
        ((13 - rh) / 4.0) * Math.sqrt((17 - Math.abs(T_F - 95.0)) / 17.0);
      HeatIndexValue -= adjustment;
      // Apply an adjustment for high humidities
    } else if (rh > 85 && T_F >= 80 && T_F < 87) {
      let adjustment = ((rh - 85) / 10.0) * ((87 - T_F) / 5.0);
      HeatIndexValue += adjustment;
    }
    return HeatIndexValue;
  }
}

const options = { enableHighAccuracy: true, timeout: 15000, maximumAge: 3600 };

async function success(pos) {
  await main(pos.coords.latitude.toFixed(4), pos.coords.longitude.toFixed(4));
}

async function error(error) {
  throw new Error("Exiting");
}

globalThis.navigator.geolocation.getCurrentPosition(success, error, options);
