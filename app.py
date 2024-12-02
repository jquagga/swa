#!/usr/bin/env python

import math
import sys

from pyscript import HTML, display, fetch, window
from pyscript.ffi import create_proxy


async def main(latitude, longitude):
    # sourcery skip: use-contextlib-suppress
    headers = {
        "accept": "application/ld+json",
        "user-agent": "https://github.com/jquagga/swa",
    }

    # Let's test and make sure we get an ok response for this lat/long
    # NWS responds with a 404 for points it doesn't cover so that serves
    # as an error check.
    response = await fetch(
        f"https://api.weather.gov/points/{latitude},{longitude}",
        headers=headers,
    )
    if response.ok:
        point = await response.json()
    else:
        display(
            HTML(
                f"""<div class="alert alert-primary" role="alert">
        <p>We didn't receive a good response from the NWS API. It may be down, or you may be feeding it a location ({latitude},{longitude})
        not covered by the US National Weather Service.  As an alternative, may I suggest trying <a href="https://merrysky.net/">MerrySky</a>.
        </p>
        </div>"""
            )
        )
        sys.exit("Exiting")

    alerts = await fetch(
        f"https://api.weather.gov/alerts?active=true&status=actual&message_type=alert,update&point={latitude},{longitude}&limit=50",
        headers=headers,
    ).json()

    # This pulls the daily forecast
    forecast = await fetch(
        point["forecast"],
        headers=headers,
    ).json()

    forecastHourly = await fetch(
        point["forecastHourly"],
        headers=headers,
    ).json()

    alerts = await alert_processing(alerts)
    chart = await build_chart(forecastHourly)
    await display_page(point, forecast, chart, alerts, latitude, longitude)


async def alert_processing(alerts):
    # Mapping of severity levels to Bootstrap alert classes
    severity_classes = {
        "Extreme": "danger",
        "Severe": "warning",
        "default": "info",  # Fallback for other severity levels
    }

    alert_string = ""
    for alert in alerts["@graph"]:
        alert_class = severity_classes.get(
            alert["severity"], severity_classes["default"]
        )
        alert_string += f"""
        <div class="alert alert-{alert_class}" role="alert">
            <h4 class="alert-heading"><a class="alert-link" data-bs-toggle="collapse" href="#collapse{alert['id']}">
            {alert['event']}</a></h4>
            <div class="collapse" id="collapse{alert['id']}">
            <hr>
            <p>{alert['headline']}</p>
            <p>{alert['description']}</p>
            <p>{alert['instruction']}</p>
            </div>
        </div>
        """
    return alert_string


async def build_chart(forecastHourly):
    # Let's tweak 8 periods (what we display in the chart) out
    # of the 168 or so.
    for i in range(8):
        # Micropython doesn't really play nicely with datetime so
        # we substr out the hour from the iso8601 date string and
        # convert to AM/PM ye old fashioned way.
        hour = (forecastHourly["periods"][i]["startTime"])[11:13]
        if int(hour) == 0:
            hour = "12 AM"
        elif int(hour) == 12:
            hour = "12 PM"
        elif int(hour) > 12:
            hour = int(hour) - 12
            hour = f"{str(hour)} PM"
        else:
            hour = f"{int(hour)} AM"
        forecastHourly["periods"][i]["startTime"] = hour
        #################################################
        # Apparent temperature
        # First, windSpeed has mph in the string so let's strip it out to a number
        windspeed = forecastHourly["periods"][i]["windSpeed"].split()
        forecastHourly["periods"][i]["windSpeed"] = float(windspeed[0])
        # Now we send temp, humidity and windspeed to the apptempF function from weewx
        forecastHourly["periods"][i]["appTemp"] = apptempF(
            float(forecastHourly["periods"][i]["temperature"]),
            float(forecastHourly["periods"][i]["relativeHumidity"]["value"]),
            forecastHourly["periods"][i]["windSpeed"],
        )

    # And this builds the chart section and returns it to be included.
    return f"""
        <div class="container">
        <canvas id="myChart"></canvas>
        </div>

    <script>
        Chart.register(ChartDataLabels);

        const ctx = document.getElementById('myChart');

        new Chart(ctx, {{
            type: 'line',
            data: {{
                labels: ['{forecastHourly["periods"][0]["startTime"]}', '{forecastHourly["periods"][1]["startTime"]}', '{forecastHourly["periods"][2]["startTime"]}', '{forecastHourly["periods"][3]["startTime"]}', '{forecastHourly["periods"][4]["startTime"]}', '{forecastHourly["periods"][5]["startTime"]}', '{forecastHourly["periods"][6]["startTime"]}', '{forecastHourly["periods"][7]["startTime"]}'],
                datasets: [{{
                    label: 'Temperature',
                    data: [{forecastHourly["periods"][0]["temperature"]}, {forecastHourly["periods"][1]["temperature"]}, {forecastHourly["periods"][2]["temperature"]}, {forecastHourly["periods"][3]["temperature"]}, {forecastHourly["periods"][4]["temperature"]}, {forecastHourly["periods"][5]["temperature"]}, {forecastHourly["periods"][6]["temperature"]}, {forecastHourly["periods"][7]["temperature"]}],
                    borderColor: '#FF0000',
                    backgroundColor: '#FF0000',
                    showLine: false,
                    yAxisID: 'y',
                }},
                {{
                    label: 'Apparent Temperature',
                    data: [{forecastHourly["periods"][0]["appTemp"]}, {forecastHourly["periods"][1]["appTemp"]}, {forecastHourly["periods"][2]["appTemp"]}, {forecastHourly["periods"][3]["appTemp"]}, {forecastHourly["periods"][4]["appTemp"]}, {forecastHourly["periods"][5]["appTemp"]}, {forecastHourly["periods"][6]["appTemp"]}, {forecastHourly["periods"][7]["appTemp"]}],
                    borderColor: '#a40000',
                    backgroundColor: '#a40000',
                    showLine: false,
                    yAxisID: 'y',
                }},
                {{
                    label: 'Chance of Precipitation',
                    data: [{forecastHourly["periods"][0]["probabilityOfPrecipitation"]["value"]}, {forecastHourly["periods"][1]["probabilityOfPrecipitation"]["value"]}, {forecastHourly["periods"][2]["probabilityOfPrecipitation"]["value"]}, {forecastHourly["periods"][3]["probabilityOfPrecipitation"]["value"]}, {forecastHourly["periods"][4]["probabilityOfPrecipitation"]["value"]}, {forecastHourly["periods"][5]["probabilityOfPrecipitation"]["value"]}, {forecastHourly["periods"][6]["probabilityOfPrecipitation"]["value"]},{forecastHourly["periods"][7]["probabilityOfPrecipitation"]["value"]}],
                    borderColor: '#add8e6',
                    backgroundColor: '#add8e6',
                    showLine: true,
                    fill: true,
                    yAxisID: 'y1',
                    pointRadius: 0,
                    datalabels: {{
                    display: false
                    }},
                }}
                ]
            }},
            options: {{
                animation: false,
                scales: {{
                    y: {{
                        type: 'linear',
                        beginAtZero: false,
                        grace: "5%"
                    }},
                    y1: {{
                      type: 'linear',
                      display: false,
                      position: 'right',
                      min: 0,
                      max: 100,

                      // grid line settings
                      grid: {{
                        drawOnChartArea: false, // only want the grid lines for one axis to show up
                    }},
                    }},
                }},
              plugins: {{
              datalabels: {{
                backgroundColor: function(context) {{
                  return context.dataset.backgroundColor;
                }},
                borderRadius: 25,
                borderWidth: 2,
                color: 'white',
                font: {{
                  weight: 'bold'
                }},
                formatter: Math.round,
                padding: 2,
                display: 'auto'
              }},
              legend: {{
                display: true,
                position: 'bottom',
                align: 'start',
                labels: {{
                  usePointStyle: true,
                }},
              }},
            }},
            }}
        }});
    </script>
    """


# These 4 functions come directly from weewx to generate apparent temperature
# for the hourly chart. This essentially replaces Wind Chill and Heat Index
# and that's not what NWS presents, but it's my preference. (It's also easier to have 1 value)
# This is essentially "Feels Like Temperature"
# https://github.com/weewx/weewx/blob/master/src/weewx/wxformulas.py


def FtoC(x):
    return (x - 32.0) / 1.8


def CtoF(x):
    return x * 1.8 + 32.0


def apptempF(t_F, rh, ws_mph):
    t_C = FtoC(t_F)
    ws_mps = ws_mph * 1609.34 / 3600.0
    at_C = apptempC(t_C, rh, ws_mps)
    return CtoF(at_C) if at_C is not None else ""


def apptempC(t_C, rh, ws_mps):
    e = (rh / 100.0) * 6.105 * math.exp(17.27 * t_C / (237.7 + t_C))
    return t_C + 0.33 * e - 0.7 * ws_mps - 4.0


async def display_page(point, forecast, chart, alerts, latitude, longitude):
    # Build the html which will go into the page.
    display(
        HTML(
            f"""
    <div class="container">
      <h1>
        Weather for {point["relativeLocation"]['city']},
        {point["relativeLocation"]['state']}
      </h1>
    </div>

    <div class="container">
        {alerts}
    </div>

    {chart}

    <div class="container">
    <table class="table table-striped">
      <tbody>
        <tr>
          <td><b>{forecast["periods"][0]["name"]}</b></td>
          <td>{forecast["periods"][0]["detailedForecast"]}</td>
        </tr>
          <td><b>{forecast["periods"][1]["name"]}</b></td>
          <td>{forecast["periods"][1]["detailedForecast"]}</td>
        </tr>
        <tr>
          <td><b>{forecast["periods"][2]["name"]}</b></td>
          <td>{forecast["periods"][2]["detailedForecast"]}</td>
        </tr>
        <tr>
          <td><b>{forecast["periods"][3]["name"]}</b></td>
          <td>{forecast["periods"][3]["detailedForecast"]}</td>
        </tr>
        <tr>
          <td><b>{forecast["periods"][4]["name"]}</b></td>
          <td>{forecast["periods"][4]["detailedForecast"]}</td>
        </tr>
        <tr>
          <td><b>{forecast["periods"][5]["name"]}</b></td>
          <td>{forecast["periods"][5]["detailedForecast"]}</td>
        </tr>
      </tbody>
    </table>
    </div>
    <div class="container">
    <div id="map" style="min-width: 100%; min-height: 50vh; position: relative"></div>
    <script>
      map = L.map("map").setView([{latitude}, {longitude}], 8);

      L.tileLayer('https://{{s}}.basemaps.cartocdn.com/light_all/{{z}}/{{x}}/{{y}}{{r}}.png', {{
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }}).addTo(map);

      L.tileLayer
        .wms("https://mapservices.weather.noaa.gov/eventdriven/services/radar/radar_base_reflectivity/MapServer/WMSServer?", {{
          layers: "1",
          format: "image/png",
          transparent: true,
          attribution: "National Weather Service",
        }})
        .addTo(map);
      </script>
    </div>

    <div class="container">
    <p class="text-center"><button type="button" class="btn btn-outline-primary"><a href=https://forecast.weather.gov/MapClick.php?lat={latitude}&lon={longitude} class="link-primary">Weather.gov forecast</a></button></p>
    <p class="text-center">This forecast is generated from the U.S. National Weather Service's <a href="https://www.weather.gov/documentation/services-web-api">weather.gov API</a>
    using this <a href="https://github.com/jquagga/swa">Simple Weather App</a>.</p>
    </div>
    """
        )
    )


# These are the geolocation functions.  They should ask for your current location
# and then pass that off to weather()

options = {"enableHighAccuracy": True, "timeout": 6000, "maximumAge": 3600}


async def success(pos):
    # Apparently the NWS api throws a 301 error with lat/long over 4 decimals
    # That 301 still has the data we'd want, but we end up downloading it twice
    # So let's round the lat/lon to 4 decimals up front and save a fetch.
    await main(round(pos.coords.latitude, 4), round(pos.coords.longitude, 4))


async def error(err):
    display(
        HTML(
            r"""<div class="alert alert-primary" role="alert">
            <b>Hello!</b>
            This site utilizes the U.S. National Weather Service's <a href="https://www.weather.gov/documentation/services-web-api">weather.gov</a> API to generate a local forecast from your geolocated position.
             You may have answered "no" to the request for location, or your browser wasn't able to find your location so we're going to show the
             weather in Honolulu, HI.  For more information, you can <a href="https://github.com/jquagga/swa">see the code for this project.</a></div>"""
        )
    )
    # Until we can sort out geolocation api fun, let's use a fake location
    # for building purposes (Hawaii)
    await main(21.3069, -157.8583)


window.navigator.geolocation.getCurrentPosition(
    create_proxy(success), create_proxy(error), options
)
