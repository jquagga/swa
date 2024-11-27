#!/usr/bin/env python

from pyscript import display, HTML, fetch, window
from pyscript.ffi import create_proxy


async def weather(latitude, longitude):
    headers = {
        "accept": "application/ld+json",
        "user-agent": "https://github.com/jquagga/swa",
    }
    point = await fetch(
        f"https://api.weather.gov/points/{latitude},{longitude}",
        headers=headers,
    ).json()

    display(
        HTML(
            f"<h1>Weather for {point["relativeLocation"]['city']}, {point["relativeLocation"]['state']}</h1>"
        )
    )

    # This pulls the daily forecast
    forecast = await fetch(
        point["forecast"],
        headers=headers,
    ).json()

    display(HTML('<div class="container">'))
    # And this loop pulls in 6 periods of daily weather (next 3 days)
    for i in range(8):
        display(
            HTML(
                f'<div class="row"><div class="col"><b>{forecast["periods"][i]["name"]}</b></div><div class="col-10">{forecast["periods"][i]["detailedForecast"]}</div></div>'
            )
        )
    display(HTML("</div>"))

    # forecastHourly = await fetch(
    #     point["forecastHourly"],
    #     headers=headers,
    # ).json()

    # Limit this to 4 datapoints for now to prevent a flood of datapoints
    # for i in range(4):
    #     display(forecastHourly["periods"][i])


# These are the geolocation functions.  They should ask for your current location
# and then pass that off to weather()

options = {"enableHighAccuracy": True, "timeout": 5000, "maximumAge": 0}


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
