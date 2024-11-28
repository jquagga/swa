#!/usr/bin/env python

from pyscript import HTML, display, fetch, window
from pyscript.ffi import create_proxy


async def weather(latitude, longitude):
    # sourcery skip: use-fstring-for-concatenation
    headers = {
        "accept": "application/ld+json",
        "user-agent": "https://github.com/jquagga/swa",
    }
    point = await fetch(
        f"https://api.weather.gov/points/{latitude},{longitude}",
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

    # Micropython doesn't really play nicely with datetime so
    # we substr out the hour from the iso8601 date string and
    # convert to AM/PM ye old fashioned way.
    for i in range(6):
        hour = (forecastHourly["periods"][i]["startTime"])[11:13]
        if int(hour) > 12:
            hour = int(hour) - 12
            hour = str(hour) + " PM"
        else:
            hour = str(hour) + " AM"
        forecastHourly["periods"][i]["startTime"] = hour

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

    <table class="table table-striped">
      <tbody>
        <tr>
          <td><b>{forecast["periods"][0]["name"]}</b></td>
          <td>{forecast["periods"][0]["detailedForecast"]}</td>
        </tr>
        <tr>
          <td>
            <b>{forecastHourly['periods'][0]['startTime']}</b
            ><br />{forecastHourly['periods'][0]['temperature']}
            {forecastHourly['periods'][0]['temperatureUnit']}
          </td>
          <td>{forecastHourly['periods'][0]['shortForecast']}</td>
        </tr>
        <tr>
          <td>
            <b>{forecastHourly['periods'][1]['startTime']}</b
            ><br />{forecastHourly['periods'][1]['temperature']}
            {forecastHourly['periods'][1]['temperatureUnit']}
          </td>
          <td>{forecastHourly['periods'][1]['shortForecast']}</td>
        </tr>
        <tr>
          <td>
            <b>{forecastHourly['periods'][2]['startTime']}</b
            ><br />{forecastHourly['periods'][2]['temperature']}
            {forecastHourly['periods'][2]['temperatureUnit']}
          </td>
          <td>{forecastHourly['periods'][2]['shortForecast']}</td>
        </tr>
        <tr>
          <td>
            <b>{forecastHourly['periods'][3]['startTime']}</b
            ><br />{forecastHourly['periods'][3]['temperature']}
            {forecastHourly['periods'][3]['temperatureUnit']}
          </td>
          <td>{forecastHourly['periods'][3]['shortForecast']}</td>
        </tr>
        <tr>
          <td>
            <b>{forecastHourly['periods'][4]['startTime']}</b
            ><br />{forecastHourly['periods'][4]['temperature']}
            {forecastHourly['periods'][4]['temperatureUnit']}
          </td>
          <td>{forecastHourly['periods'][4]['shortForecast']}</td>
        </tr>
        <tr>
          <td>
            <b>{forecastHourly['periods'][5]['startTime']}</b
            ><br />{forecastHourly['periods'][5]['temperature']}
            {forecastHourly['periods'][5]['temperatureUnit']}
          </td>
          <td>{forecastHourly['periods'][5]['shortForecast']}</td>
        </tr>
        <tr>
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
    """
        )
    )


# These are the geolocation functions.  They should ask for your current location
# and then pass that off to weather()

options = {"enableHighAccuracy": True, "timeout": 6000, "maximumAge": 3600}


async def success(pos):
    await weather(pos.coords.latitude, pos.coords.longitude)


async def error(err):
    display("There was an error in the geolocation api so let's pretend we are at IAD")
    # Until we can sort out geolocation api fun, let's use a fake location
    # for building purposes (Dulles Airport, VA)
    await weather(38.944444, -77.45583)


window.navigator.geolocation.getCurrentPosition(
    create_proxy(success), create_proxy(error), options
)
