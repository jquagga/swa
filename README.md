# Simple Weather App

> Simple Weather App is a progressive web app which queries the US National Weather Service API to provide a responsive weather forecast.

## ✨ [Demo](https://www.partlycloudy.org/)

> [!CAUTION]
> This should not be your only source of weather data and especially not the only source of severe weather alerts!

## Install

Clone the repository to a directly and serve with a https capable webserver. (or you can just bookmark [partlycloudy.org(https://www.partlycloudy.org/)] above)

## Usage

The app utilizes the javascript geolocation API to query location and returns the forecast from NWS. You simply have to allow location access. The app runs local to the browser so your location is never shared with me, however it is shared with NWS (in order to give you the forecast you have to tell it a location).

> [!IMPORTANT]
> Simple Weather App only supports locations covered by US NWS forecast data (so largely the United States). If you are outside that area, might I suggest the excellent [MerrySky](https://merrysky.net/) as a great alternative!

## Implementation Details

The app polls the NWS alerts, forecast and forecastHourly. Alerts are displayed if there are any for the location. The weekly forecast (forecast) shows the next 6 periods (3 day/night combinations). And forecastHourly presently displays the temperature, apparent temperature and probability of precipitation.

The goal was to provide the upstream data as similarly as possible. All data should come NWS EXCEPT for apparent temperature (similar to a "Feel's Like") which is calculated in the same manner as the excellent WeeWX software.[^appTemp]

[^appTemp]: While not presently displayed on the weather.gov page, NWS does provide apparent temperature data in their raw forecastGrid. I've opted for generating the temperature as forecastGrid has varying time durations; calculating was a simpler implementation.

## Acknowledgements

- NWS Weather.gov API
- pyscript
- bootstrap
- chart.js
- WeeWX
