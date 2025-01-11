# Simple Weather App

> Simple Weather App is a progressive web app which queries the US National Weather Service API to provide a responsive weather forecast.

## ✨ [Demo](https://www.partlycloudy.org/)

> [!CAUTION]
> This should not be your only source of weather data and especially not the only source of severe weather alerts!

## Install

Clone the repository and `npm run build` should put it all together. Serve with https (or you can just bookmark [partlycloudy.org](https://www.partlycloudy.org/).

## Usage

The app utilizes the javascript geolocation API to query location and returns the forecast from NWS. You simply have to allow location access. The app runs local to the browser so your location is never shared with me, however it is shared with NWS (in order to give you the forecast you have to tell it a location).

> [!IMPORTANT]
> Simple Weather App only supports locations covered by US NWS forecast data (so largely the United States). If you are outside that area, might I suggest the excellent [MerrySky](https://merrysky.net/) as a great alternative!

## Implementation Details

The app polls the NWS alerts, forecast and forecastHourly. Alerts are displayed if there are any for the location. The graph at near the top of the screen is temperature and chance of precipitation over the next 24 hours. The normal text forecast follows in a table and the radar is displayed towards the bottom.

The goal was to provide the upstream data as similarly as possible; just in a more mobile friendly format.

## Acknowledgements \ Tech Stack

- [National Weather Service Weather.gov API](https://www.weather.gov/documentation/services-web-api)
- Svelte
- PicoCSS
- chart.js
- Maplibre-gl JS with [OpenFreeMap](https://openfreemap.org/)
- Icon comes from [Meteocons](https://github.com/basmilius/weather-icons)
