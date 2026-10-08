# Zone Forecast Product Specifications Document

March 27, 2020 edition

1. **General Specifications**

   1.1 Combining Periods. The first period of the forecast must stand alone. All other forecast periods may be combined when weather elements (including winds and restrictions to visibility) are similar. Regional Headquarters will define weather element similarity, i.e., combination thresholds. When the following criteria are met, the formatter may combine periods after the third period depending upon local formatter configuration:

       - Reported PoP value does not change, and

       - Wind directions are within 45 degrees and speeds within 10 MPH (first 5 periods only), and

       - Reported sky cover wording is the same, and

       - Expected precipitation for both periods are identical, and

       - Temperatures are within 5 degrees (max v. max and min v. min only)

   1.2 Content. The ZFP should reflect the observed, imminent and/or expected weather conditions to affect specific zones or zone groupings. The ZFP includes the following weather parameters: precipitation and probability of precipitation, sky cover, temperature, wind, and visibility restrictions. Wind and visibility restriction elements are optional beyond the fifth period.

   1.3. Forecast Database Sampling**. **Data used to construct the ZFP are sampled using a variety of statistical techniques. Unless otherwise noted, all fields are sampled using two sub periods with a duration of 6 hours starting at either 6 a.m. or 6 p.m. LT. This may not be the case within the first period of the forecast only.

   1.4. References to Holidays. Ten federally recognized U.S. holidays will be used to reference the daytime period instead of the day of the week. These ten holidays refer to the actual day on which they occur. The ZFP formatter will utilize these holidays in the text product.

| **Federally Recognized Holiday** | **Day/Date Referenced in the ZFP** |
| -------------------------------- | ---------------------------------- |
|                                  |                                    |
| NEW YEARS DAY                    | January 1                          |
| MARTIN LUTHER KING JR DAY        | Third Monday in January            |
| WASHINGTONS BIRTHDAY             | Third Monday in February           |
| MEMORIAL DAY                     | Last Monday in May                 |
| INDEPENDENCE DAY                 | July 4                             |
| LABOR DAY                        | First Monday in September          |
| COLUMBUS DAY                     | Second Monday in October           |
| VETERANS DAY                     | November 11                        |
| THANKSGIVING DAY                 | Fourth Thursday in November        |
| CHRISTMAS DAY                    | December 25                        |

1.5. Formatted Elements within the ZFP. The following elements and how they are defined within the ZFP by the formatters are as follows.

        1.5.1 Precipitation and Probability of Precipitation (PoP). Formatter output will describe the occurrence, and expected probability, of measurable precipitation (0.01 inch) across each zone for all periods through Day 7. For stratiform weather situations, the POP range (to the nearest whole 10 percent) should extend from 20 to 100 percent. In convective weather situations, 10 percent may also be used to better describe isolated precipitation. For example, isolated, high-based thunderstorms may (by virtue of their areal coverage or sub-cloud evaporation) result in any given area having only a slight chance (i.e., 10%) of measurable rainfall.


              a. Precipitation Events. Precipitation forecast text will specify the type and, as appropriate, qualify the intensity.


              b. Precipitation Intensity. During the first 72 hours of the forecast, intensity of precipitation should be identified as light, moderate (*characterized by the absence of a modifying term to describe the intensity*), or heavy. Beyond 72 hours of forecast, no intensity designator is applied to the grids. This period indicates a mid-range, and reflects forecaster uncertainty.


              c. Qualifying Terms. When POPs are separated from the precipitation element, the formatter may use qualifying terms to aid in user understanding. Qualifying terms used by the formatter will conform to the definitions found in Table 1 below. Formatters will not combine qualifying and areal terms.

| **POP**       | **Qualifying Term**   | **Equivalent Areal Term (convective only)** |
| ------------- | --------------------- | ------------------------------------------- |
| **10**        | SLIGHT CHANCE or none | ISOLATED or none                            |
| **20**        | SLIGHT CHANCE         | ISOLATED                                    |
| **30 40 50**  | CHANCE                | SCATTERED                                   |
| **60 70**     | LIKELY                | NUMEROUS                                    |
| **80 90 100** | NONE                  | NONE                                        |

**Table 1: **Qualifying and Equivalent Areal Terms.

              d. Precipitation types formatted in the ZFP will conform with standard terminology found in FMH \#1 with the following exceptions:


                 (1) “Snow” will be the term used to indicate snow, snow pellets, and snow grains.

                 (2) “Sleet” will be used instead of “ice pellets”


              e. Mixed and Multiple Precipitation Types. The formatter should generate clear text to indicate the probability of measurable precipitation -- not the chance of changing from one type of precipitation to another. Formatted text will not generate confusing wording implying the likelihood of changing to snow, e.g., “70 PERCENT CHANCE OF RAIN CHANGING TO SNOW.”

              f. Cases Where No POP Value is Required. Formatters are not required to include a POP when:

                 (1) Zone forecasts include the optional in-line point forecasts for specific cities

                 (2) Precipitation is occurring

                 (3) Terrain is topographically complex.

                 (4) The POP value is less than or equal to 20 percent

                 (5) For trace precipitation events (drizzle, snow flurries). Instead, qualifying terms should be used to indicate the likelihood of precipitation not expected to produce measurable quantities Terms such as dry thunderstorms, sprinkles, drizzle, flurries, etc., may be used to imply very light precipitation resulting in trace events. During events of prolonged drizzle or flurries that can produce measurable precipitation, include a POP.

Precipitation and POP are:

- Sampled using standard deviation maximum average technique (1.0 standard deviation range around sample mean)

  - Used to determine if Weather or Sky cover phrasing will be included

- Sampled using binnedPercent technique for duration of forecast period

  - Used to find a PoP value which corresponds to sampled Weather

  - Maximum rounded value from appropriate category used (matching PoP and Weather probabilities/coverages can be found in Table 1.

- Reported when rounded PoP value is equal to or greater than threshold for that period

  - 20% for first period (could be extended through the fifth period at local WFO discretion)

  - 30% for all periods after period chosen to end above threshold

- Value from 20-100% using:

  - RAIN for all liquid precipitation

  - SNOW for all frozen precipitation

  - PRECIPITATION if neither case above applies

- Generally reported separately, but could be combined with Sky and Weather when conditions do not vary significantly through the entire forecast period

  1.5.2 Weather. Forecasts will describe expected weather across each zone for all periods through Day 7. A detailed list of valid weather types can be found in Table 2.

| **Precipitation Types** | **Non-Precipitation Types** |
| :---------------------: | :-------------------------: |
|         Drizzle         |        Blowing Dust         |
|    Freezing Drizzle     |        Blowing Sand         |
|      Freezing Rain      |        Blowing Snow         |

| Ice Crystals  |      Fog       |
| :-----------: | :------------: |
|     Rain      |  Freezing Fog  |
| Rain Showers  | Freezing Spray |
|     Sleet     |     Frost      |
|     Snow      |      Haze      |
| Snow Showers  |    Ice Fog     |
| Thunderstorms |     Smoke      |
|               |  Volcanic Ash  |
|               |  Waterspouts   |

# Table 2: Reportable Weather Types

Formatters will include visibility restrictions, such as fog, haze, smoke, blowing snow, blowing dust and volcanic ash; when visibilities are forecast to be less than or equal to 1/4 mile through the first five periods of the ZFP. Visibility restrictions may be included in the forecast text for visibilities greater than 1/4 mile up to 6 miles, based on local user requirements. Formatters should describe the visibility obstruction and its corresponding reduced distance within the body of the forecast text. Areal coverage terms used to describe restrictions to visibility are: PATCHY, AREAS, and WIDESPREAD

Other aspects for weather:

- Sampled using rankedWx technique

- Reported in all periods if not a form of precipitation

- Precipitation reported when the PoP criteria defined above are met

- Reported in combination with Sky and PoP when conditions do not vary significantly through the entire forecast period

- Severe weather phrasing included if severe weather attributes, such as large hail or damaging winds, are present in the sample

- Heavy precipitation phrasing included during the first 3 days if a heavy precipitation intensity (+) is found

- Visibility of ¼ mile or less will be reported when any of these weather types are present:

  - Fog, haze, smoke, blowing snow, blowing dust or volcanic ash

    1.5.3 Sky Cover. Forecasts may include a predominant opaque sky cover in all periods through Day 7.

- Sampled using average value technique

- Is optional if PoP is 60% or greater for majority of period

- Qualifying terms used by the formatter will conform to the definitions found in Table 3 below.

| **Daytime Expressions**                  | **Nighttime Expressions**                | **Predominant Opaque Sky Cover (Percent)** |
| ---------------------------------------- | ---------------------------------------- | ------------------------------------------ |
| SUNNY or CLEAR                           | CLEAR                                    | 0% to  5%                                 |
| SUNNY or MOSTLY CLEAR                    | MOSTLY CLEAR                             | \> 5% and  25%                            |
| MOSTLY SUNNY/PARTLY CLOUDY               | PARTLY CLOUDY                            | \> 25% and  50%                           |
| PARTLY SUNNY/MOSTLY CLOUDY               | MOSTLY CLOUDY                            | \> 50% and  69%                           |
| MOSTLY CLOUDY or CONSIDERABLE CLOUDINESS | MOSTLY CLOUDY or CONSIDERABLE CLOUDINESS | \> 69% and  87%                           |
| CLOUDY or OVERCAST                       | CLOUDY or OVERCAST                       | \> 87% and  100%                          |

**Table 3: **Predominant Sky Cover Thresholds

    1.5.4 Temperature. The ZFP will include the expected high and low temperatures in all periods through Day 7. Non-diurnal or temperature trends may also be reported. For 24-hour combined periods, the formatter will list the minimum temperature first, followed by the maximum temperature.

- Sampled hourly to determine minimum, average and maximum values

  - Used to report non-diurnal trends

- Maximum and minimum temperatures sampled using standard deviation average technique (1.0 standard deviation range around sample mean)

- Reported as a single category (around XX, lower XXs, mid XXs, upper XXs) when all sample values are between 20 and 99 degrees

  - LOWER used for temperatures that end with a 1, 2 or 3

  - MID used for temperatures that end with a 4, 5 or 6

  - UPPER used for temperatures that end with 7, 8 or 9

  - AROUND used for temperatures that end with 0, or

    - when the sample min and max values are from different decades

    - round (to the nearest 10) to the same number

    - the difference between the min and max values 4 degrees F or less

- For temperatures less than 20 or equal to or greater than 100 degrees

  - Reported as AROUND a single number during the first 5 periods

  - Reported using a rounded 5 degree range thereafter

  - Formatter should spell out the words “ABOVE”, “BELOW”, and “MINUS” as needed.

- Temperatures 10 degrees F or less will include either the word “ABOVE” or “BELOW” to describe the relationship to zero degrees F.

- Non-diurnal temperature trends reported when the trend is constant during the second half of the forecast period and the final hourly temperature differs from with the maximum (daytime) or minimum (nighttime) temperature by a locally specified amount

- Max heat index reported when local criteria are met

- Min wind chill reported when local criteria are met

  1.5.5 Wind. Wind direction and speed will be included in the first five periods of the zone forecast **_(regional guidance may alter wind forecast requirements for areas having complex terrain)_. **Deterministic winds (specific wind direction and speed) should only be included beyond the fifth period in the ZFP when the formatter combines those later forecast periods with periods two through five. In these cases, a single wind speed and direction (which applies to all combined periods) is provided in the forecast narrative

Formatters will include a wind speed and direction during the first five periods. Other aspects for wind:

- Sampled using 6 hour sub periods through the fifth period

  - Used for explicit wind forecast

- Sampled across the entire period in the sixth period and beyond

- Vector standard deviation average technique

(1.00 standard deviation range around sample mean)

- Reported wind speeds rounded to the nearest 5 MPH

- Reported wind directions will use only the 8-point compass. Changes in direction within a forecast period should be included by the formatter. Wind direction terminology that is well-known to local users is also acceptable. For example, in tropical regions, the formatter may refer to wind direction as “TRADES.” Additionally, terms such as “SEA BREEZE,” “LAKE BREEZE,” “ONSHORE WINDS,” and “DOWNSLOPE WINDS” are permitted within the formatters.

  - NORTH, NORTHEAST, EAST, SOUTHEAST, SOUTH, SOUTHWEST,

WEST or NORTHWEST

- Wind shifts of 60 degrees or more considered significant enough to report when sample max wind speed less than 10 MPH

- Wind shifts of 45 degrees or more considered significant enough to report when sample max wind speed 10 MPH or more

- Winds reported as “LIGHT AND VARIABLE” for sample max speed less than 5 MPH

- Winds reported using at most a 5 MPH range for sample max speed 5 to 19 MPH

- Winds reported using at most a 10 MPH range for sample max speed 20 to 39 MPH

- Winds reported using at most a 20 MPH range for sample max speed 40 MPH or more

  1.5.6 Wind Gust. Forecasts will include wind gusts when appropriate through the fifth period.

- Sampled using a moderated max value technique

- Reported if max wind gust greater than defined threshold (20 MPH default) and Wind Gust exceeds wind speed by 10 MPH or more

- Wind gusts that increase or decrease by 10 MPH or more between sub periods, and still meet the above requirement, considered significant to report

  1.5.7 Snow accumulation. Quantitative snowfall accumulations should be included by formatters in the first three periods of the ZFP (in Western Region, out to 72 hours) whenever the POP forecast is 60% (in Western Region whenever the POP is 30% or greater). If a snow event is forecast to end in the 1st, 2nd or 3rd period, formatters should produce a storm total amount in the final period the snow is forecast to end. If snow is forecast to begin in, or continue after the 3rd period, *generalized *quantitative snowfall amounts should be used as detailed below.

Formatters should not include snowfall accumulations in the ZFP when the POP forecast is less than 60%, except in the following two instances:

(1) Issuance of a Winter Storm Watch with a 50% POP (associated *generalized *quantitative snowfall amounts used) or;

(2) When snow showers or squalls are forecast to produce localized snowfall accumulations (high probability of occurrence, but associated POP may be low as it refers to areal coverage).

Snow accumulations (quantitative or generalized quantitative) should not be used beyond the 4th period in the ZFP. If necessary, use descriptive terms instead. Snow accumulations are:

    - Sampled for the duration of a forecast period

    - Average value used

    - Explicitly reported when PoP threshold is met during the first three periods

    - General descriptions used after the third period when PoP threshold is met

      - “LIGHT ACCUMULATIONS” for expected average snow accumulation below Winter Weather Advisory criteria

      - “MODERATE ACCUMULATIONS” for expected average snow accumulation meeting Winter Weather Advisory criteria

      - “SIGINFICANT ACCUMULATIONS” for expected average snow accumulation meeting Winter Storm Watch criteria

    - Snow accumulation reported as “POSSIBLE” when PoP threshold is met and PoP is within these ranges:

      - 30-50% during the first two periods

      - 30-70% in the third period and beyond

    - Snow accumulation reported as “ADDITIONAL” in each period after a snow/sleet event has been determined to have begun

    - “SLEET ACCUMULATION” explicitly mentioned when snow is not forecast to occur in addition to the sleet

    - Storm total snow accumulation reported in the first three periods when expected snow accumulation in next forecast period is less than 1 inch

    - Snow accumulation for a forecast period is not reported if a storm total snow accumulation will be mentioned in the same period

| **Average Snow Accumulation** | **Categorical Phrasing**  |
| ----------------------------- | ------------------------- |
| 0                             | Little or no accumulation |
| 1 inch                        | Around an inch            |
| 2 inches                      | 1 to 3 inches             |
| 3 inches                      | 2 to 4 inches             |
| 4 inches                      | 3 to 5 inches             |
| 5 inches                      | 4 to 6 inches             |
| 6-7 inches                    | 4 to 8 inches             |
| 8-9 inches                    | 6 to 10 inches            |
| 10-11 inches                  | 8 to 12 inches            |
| 12-13 inches                  | 10 to 14 inches           |
| 14-15 inches                  | 12 to 16 inches           |
| 16-17 inches                  | 12 to 18 inches           |
| 18–24 inches                  | 18 to 24 inches           |
| \> 24 inches                  | More than 2 feet          |

# Table 4: Snow accumulation lookup table

**2. Definitions and General Terminology**

This section contains meteorological terms that can be utilized by formatters for the ZFP. Please refer to other sources (e.g., pertinent procedural directives, The Glossary of Meteorology, 2nd edition, published by the American Meteorological Society, etc.) for more details or terms not defined here.

**Areas**: Areal coverage of non-measurable, non-convective weather and/or restrictions to visibility affecting 25 to 50 percent of a forecast zone(s).

**Blowing Snow**: Snow lifted from the surface of the earth by the wind to a height of 6 feet or more above the ground, and blown about in such quantities that horizontal visibility is reduced to less than 7 statute miles.

**Drifting Snow**: Snow raised from the surface of the earth by the wind to a height of less than 6 feet.

**Drizzle**: Very small (diameters of less than 0.02 inch), numerous, and uniformly distributed water drops that may appear to float while following air currents. Unlike fog droplets drizzle falls to the ground.

**Dry Thunderstorm**: A storm produced by a cumulonimbus cloud(s) accompanied by lightning, gusty wind, and little or no precipitation (i.e., 0.10 inch or less).

**Dust storm**: A severe weather condition characterized by poor visibility (5/8 of a mile or less), strong wind and dust-filled air over a widespread area.

**Fog**: A visible aggregate of minute water droplets near the earth's surface which reduces horizontal visibility and, unlike drizzle, does not rapidly fall to the ground.

**Freeze**: Conditions when the temperature at or near the surface is expected to be 32 degrees F or below.

**Freezing Rain/Drizzle**: Rain/drizzle that falls in liquid form but freezes on contact to form a coating of glaze upon the ground and on other exposed surfaces.

**Frost**: The formation of thin ice crystals on a cold object, such as a window or bridge, which forms by direct deposition of water vapor to solid ice.

**Haze**: A suspension in the air of extremely small, dry particles which, individually, are invisible to the naked eye. When numerous, they can restrict visibility.

**Long Duration Hazardous Weather**: Weather events in effect for three hours or more that may endanger life or property, or provide an impediment to commerce. These weather events warrant the issuance of a NWS watch, warning, or advisory.

**Measurable Precipitation**: 0.01 inches or greater of liquid precipitation or water equivalent of frozen precipitation.

**Opaque cloud cover**: The amount (in oktas) of cloud cover (sheet, layer or patch) which is sufficiently dense to completely hide or obscure anything (e.g., sun, moon, higher cloud layer) that might be above it.

**Patchy**: Areal coverage of non measurable, non-convective weather and/or restrictions to visibility affecting less than 25 percent of a forecast zone(s).

**Precipitation Event**: The occurrence of measurable precipitation within the area covered by the zone forecast group during a specified time period.

**Probability of Precipitation (POP)**: The likelihood, expressed as a percent, of a measurable precipitation event (0.01") at a particular point during a specified time period.

**Rain**: Liquid precipitation, either in the form of drops larger than 0.02 inch, or smaller drops which, in contrast to drizzle, do not appear to float while following air currents.

**Sandstorm**: Particles of sand carried aloft by a strong wind. The sand particles are mostly confined to the lowest ten feet, and rarely rise more than fifty feet above the ground.

**Showers**: Precipitation characterized by the suddenness with which it starts and stops, by the rapid changes of intensity, and usually by rapid changes in the appearance of the sky.

**Significant Weather**: Weather conditions that do not meet NWS watch, warning or advisory criteria but have an impact on people’s health and well-being. Such weather may affect decisions ranging from the choice of appropriate clothing, to the planning of a major event.

Examples of Significant Weather include:

Precipitation conditions:

1. Heavy rain (Large ponding/localized flooding)

2. Short duration (less than three hours) heavy snow event

3. Dry thunderstorms, especially during the summer fire season

4. Thunderstorms with frequent lightning and/or small hail

5. Snow accumulations

Non-Precipitation conditions:

1. Persistent humid or dry conditions

2. Rip currents Temperature conditions:

3. Record lows or highs

4. Notable Wind chill/Heat Index values

5. Large and/or rapid drop/rise in temperature

Wind conditions:

1. Short duration convective or non-convective strong wind events

2. Sea breezes

3. Foehn winds

**Sleet (ice pellets)**: Generally frozen raindrops (or refrozen melted snowflakes) which usually bounce when hitting a hard surface. Sleet does not "stick" to exposed surfaces.

**Snow**: Frozen precipitation in the form of (white or translucent) ice crystals.

**Snow Flurries**: Intermittent, short duration snowfall with little or no accumulation.

**Snow Showers**: Intermittent, short duration snowfall, with possible accumulation.

**Snow Squalls**: Intense snowfall, accompanied by gusty surface wind and possibly lightning generally moderate to heavy snow showers). Accumulation may be significant.

**Sprinkles**: Scattered droplets of unmeasurable rain.

**Thunderstorm**: A local storm produced by a cumulonimbus cloud(s) accompanied by lightning and thunder, usually with gusts of wind, heavy rain, and sometimes with hail.

**Widespread**: Areal coverage of non-measurable, non-convective weather and/or restrictions to visibility affecting more than 50 percent of a forecast zone(s).
