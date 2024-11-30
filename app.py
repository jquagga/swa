#!/usr/bin/env python

from pyscript import HTML, display, fetch, window
from pyscript.ffi import create_proxy


async def fetch_weather(latitude, longitude):
    headers = {
        "accept": "application/ld+json",
        "user-agent": "https://github.com/jquagga/swa",
    }
    point = await fetch(
        f"https://api.weather.gov/points/{latitude},{longitude}",
        headers=headers,
    ).json()

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
    await display_page(point, forecast, chart, alerts)


async def alert_processing(alerts):
    alert_string = ""
    # Pop the @graphs up a level in the dict since everything we want is in there.
    alerts = alerts["@graph"]
    # Loop through all of the alerts and append to the alert_string
    for alert in alerts:
        alert_string = f"""{alert_string}
          <div class="alert alert-primary" role="alert">
          <h4 class="alert-heading"><a data-bs-toggle="collapse" href="#collapse{alert['id']}">
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
        # Ok, now on to computing Wind Chill for these 8 periods
        # Yes, the full grid json includes Wind Chill, but that
        # doesn't stay to hourly period (they vary) so that's a pain
        # without datetime.  So we will use the data we have from
        # forecastHourly to build the Wind Chill if it exists
        # Formula etc: https://www.weather.gov/epz/wxcalc_windchill
        # First, windSpeed has mph in the string so let's strip it out to a number
        windspeed = forecastHourly["periods"][i]["windSpeed"].split()
        windspeed[0] = float(windspeed[0])
        if float(forecastHourly["periods"][i]["temperature"]) < 50 and windspeed[0] > 3:
            forecastHourly["periods"][i]["windChill"] = (
                35.74
                + 0.6215 * forecastHourly["periods"][i]["temperature"]
                - 35.75 * (windspeed[0] ** 0.16)
                + 0.4275
                * forecastHourly["periods"][i]["temperature"]
                * (windspeed[0] ** 0.16)
            )
        else:
            forecastHourly["periods"][i]["windChill"] = ""
            # TODO - Heat Index

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
                    borderColor: '#FA0000',
                    backgroundColor: '#FA0000',
                }},
                {{
                    label: 'Wind Chill',
                    data: [{forecastHourly["periods"][0]["windChill"]}, {forecastHourly["periods"][1]["windChill"]}, {forecastHourly["periods"][2]["windChill"]}, {forecastHourly["periods"][3]["windChill"]}, {forecastHourly["periods"][4]["windChill"]}, {forecastHourly["periods"][5]["windChill"]}, {forecastHourly["periods"][6]["windChill"]}, {forecastHourly["periods"][7]["windChill"]}],
                    borderColor: '#0000CC',
                    backgroundColor: '#0000CC',
                }}]
            }},
            options: {{
                scales: {{
                    y: {{
                        type: 'linear',
                        beginAtZero: false,
                        grace: "5%"
                    }}
                }},
              plugins: {{
              datalabels: {{
                backgroundColor: function(context) {{
                  return context.dataset.backgroundColor;
                }},
                borderRadius: 2,
                color: 'white',
                font: {{
                  weight: 'bold'
                }},
                formatter: Math.round,
                padding: 2
              }},
              legend: {{
                display: true,
                position: 'bottom',
                align: 'start',
              }},
            }},
            }}
        }});
    </script>
    """


async def display_page(point, forecast, chart, alerts):
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
        <tr>
          <td><b>{forecast["periods"][6]["name"]}</b></td>
          <td>{forecast["periods"][6]["detailedForecast"]}</td>
        </tr>
      </tbody>
    </table>
    </div>
    """
        )
    )


# These are the geolocation functions.  They should ask for your current location
# and then pass that off to weather()

options = {"enableHighAccuracy": True, "timeout": 6000, "maximumAge": 3600}


async def success(pos):
    await fetch_weather(pos.coords.latitude, pos.coords.longitude)


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
    await fetch_weather(21.306944, -157.858333)


window.navigator.geolocation.getCurrentPosition(
    create_proxy(success), create_proxy(error), options
)
