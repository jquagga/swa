#!/usr/bin/env python

import js
from pyscript import display, fetch
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
        f"{point["relativeLocation"]['city']}, {point["relativeLocation"]['state']} @ {latitude}, {longitude}"
    )

    # This pulls the daily forecast
    forecast = await fetch(
        point["forecast"],
        headers=headers,
    ).json()

    # And this loop pulls in 8 periods of daily weather
    for i in range(8):
        display(
            f"{forecast["periods"][i]["name"]}: {forecast["periods"][i]["detailedForecast"]}"
        )

    forecastHourly = await fetch(
        point["forecastHourly"],
        headers=headers,
    ).json()

    # Limit this to 4 datapoints for now to prevent a flood of datapoints
    for i in range(4):
        display(forecastHourly["periods"][i])


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


js.window.navigator.geolocation.getCurrentPosition(
    create_proxy(success), create_proxy(error), options
)
