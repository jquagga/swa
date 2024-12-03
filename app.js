async function main(latitude, longitude, headertxt) {
  const headers = {
    accept: "application/ld+json",
    "user-agent": "https://github.com/jquagga/swa",
  };

  const response = await fetch(
    `https://api.weather.gov/points/${latitude},${longitude}`,
    { headers: headers },
  );
  if (response.ok) {
    // sourcery skip: avoid-using-var
    var point = await response.json();
  } else {
    const errorContainer =
      document.getElementById("error-container") ||
      document.createElement("div");
    errorContainer.id = "error-container";
    errorContainer.className = "alert alert-danger";
    errorContainer.textContent = `Error: ${response.status} ${response.statusText}`;
    document.body.appendChild(errorContainer);
    throw new Error("Exiting");
  }

  const alerts = await (
    await fetch(
      `https://api.weather.gov/alerts?active=true&status=actual&message_type=alert,update&point=${latitude},${longitude}&limit=50`,
      { headers: headers },
    )
  ).json();

  const forecast = await (
    await fetch(point.forecast, { headers: headers })
  ).json();

  const forecastHourly = await (
    await fetch(point.forecastHourly, { headers: headers })
  ).json();

  document.getElementById("header").innerHTML = await build_header(
    headertxt,
    point,
  );
  document.getElementById("alerts").innerHTML = await alert_processing(alerts);
  document.getElementById("grid").innerHTML = await build_grid(forecast);
  await build_chart(forecastHourly);
  await build_map(latitude, longitude);
  document.getElementById("footer").innerHTML =
    `<p class="text-center"><button type="button" class="btn btn-outline-primary"><a href=https://forecast.weather.gov/MapClick.php?lat=${latitude}&lon=${longitude} class="link-primary">Weather.gov forecast</a></button></p>
    <p class="text-center">This forecast is generated from the U.S. National Weather Service's <a href="https://www.weather.gov/documentation/services-web-api">weather.gov API</a>
    using this <a href="https://github.com/jquagga/swa">Simple Weather App</a>.</p>`;
}

async function build_header(headertxt, point) {
  headertxt += `
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
            <h4 class="alert-heading"><a class="alert-link" data-bs-toggle="collapse" href="#collapse${alert.id}">
            ${alert.event}</a></h4>
            <div class="collapse" id="collapse${alert.id}">
            <hr>
            <p>${alert.headline}</p>
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
    let hour = forecastHourly.periods[i].startTime.substring(11, 13);
    if (parseInt(hour) === 0) {
      hour = "12 AM";
    } else if (parseInt(hour) === 12) {
      hour = "12 PM";
    } else if (parseInt(hour) > 12) {
      hour = (parseInt(hour) - 12).toString() + " PM";
    } else {
      hour = parseInt(hour).toString() + " AM";
    }
    forecastHourly.periods[i].startTime = hour;

    const windspeed = forecastHourly.periods[i].windSpeed.split(" ");
    forecastHourly.periods[i].windSpeed = parseFloat(windspeed[0]);
    forecastHourly.periods[i].appTemp = apptempF(
      parseFloat(forecastHourly.periods[i].temperature),
      parseFloat(forecastHourly.periods[i].relativeHumidity.value),
      forecastHourly.periods[i].windSpeed,
    );
  }

  Chart.register(ChartDataLabels);
  const ctx = document.getElementById("myChart");
  new Chart(ctx, {
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
          backgroundColor: function (context) {
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
  return `<table class="table table-striped">
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
    </table>`;
}

async function build_map(latitude, longitude) {
  var map = L.map("map").setView([latitude, longitude], 8);

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: "abcd",
      maxZoom: 20,
    },
  ).addTo(map);

  L.marker([latitude, longitude]).addTo(map);

  L.tileLayer
    .wms(
      "https://mapservices.weather.noaa.gov/eventdriven/services/radar/radar_base_reflectivity/MapServer/WMSServer?",
      {
        layers: "1",
        format: "image/png",
        transparent: true,
        attribution: "National Weather Service",
      },
    )
    .addTo(map);
}

function FtoC(x) {
  return (x - 32.0) / 1.8;
}

function CtoF(x) {
  return x * 1.8 + 32.0;
}

function apptempF(t_F, rh, ws_mph) {
  const t_C = FtoC(t_F);
  const ws_mps = (ws_mph * 1609.34) / 3600.0;
  const at_C = apptempC(t_C, rh, ws_mps);
  return at_C !== null ? CtoF(at_C) : "";
}

function apptempC(t_C, rh, ws_mps) {
  const e = (rh / 100.0) * 6.105 * Math.exp((17.27 * t_C) / (237.7 + t_C));
  return t_C + 0.33 * e - 0.7 * ws_mps - 4.0;
}

const options = { enableHighAccuracy: true, timeout: 15000, maximumAge: 3600 };

async function success(pos) {
  await main(
    pos.coords.latitude.toFixed(4),
    pos.coords.longitude.toFixed(4),
    "", // This is the pre-header below for an error; not needed for a non-error.
  );
}

async function error(err) {
  headertxt = `<div class="alert alert-primary" role="alert">
            <b>Hello!</b>
            This site utilizes the U.S. National Weather Service's <a href="https://www.weather.gov/documentation/services-web-api">weather.gov</a> API to generate a local forecast from your geolocated position.
             You may have answered "no" to the request for location, or your browser wasn't able to find your location so we're going to show the
             weather in Honolulu, HI.  For more information, you can <a href="https://github.com/jquagga/swa">see the code for this project.</a></div>`;
  await main(21.3069, -157.8583, headertxt);
}

window.navigator.geolocation.getCurrentPosition(success, error, options);
