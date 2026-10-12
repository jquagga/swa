// Localized fragment dictionary for ZFP-style narratives.
//
// This is the centralization point for forecast i18n: every human-readable
// word or sentence pattern the narrative builder emits lives here as a
// plain string or a small (string) => string formatter. Templates use
// {named} placeholders; translators reorder placeholders freely so word
// order (e.g. "{type} {likely}" vs "{likely} {type}") is per-locale.
//
// Conventions (documented in docs/i18n.md):
// - Values are lowercase-initial fragments; the builder capitalizes
//   sentence starts and card labels, so translators must not pre-capitalize.
// - `sky_*`, `pop_*`, `precip_*`, `dir_*` ids are stable semantic keys —
//   `phrases.ts` returns the English id, the builder looks it up here.
// - Wind direction entries are complete prepositional phrases for the
//   locale (en "northeast", es "del noreste", fr "du nord-est") because the
//   preposition/article contract differs per language.
// - Gender/number agreement is MVP: qualifier adjectives use a single
//   invariant form; heavy precipitation uses pre-combined per-kind entries
//   so at least heavy phrases agree correctly.

export interface ZfpDictionary {
  // Sky cover (ids from skyPhrase).
  sky_sunny: string;
  sky_clear: string;
  sky_mostly_clear: string;
  sky_partly_cloudy: string;
  sky_mostly_cloudy: string;
  sky_cloudy: string;
  // Precipitation types (ids from precipKind; "rain_showers" covers the
  // "rain showers" display text).
  precip_snow: string;
  precip_rain: string;
  precip_rain_showers: string;
  precip_showers: string;
  precip_thunderstorms: string;
  precip_freezing_rain: string;
  precip_freezing_drizzle: string;
  precip_drizzle: string;
  precip_patchy_drizzle: string;
  // Pre-combined heavy variants (gender-agreeing per locale).
  heavy_snow: string;
  heavy_rain: string;
  heavy_rain_showers: string;
  heavy_showers: string;
  heavy_thunderstorms: string;
  heavy_freezing_rain: string;
  heavy_freezing_drizzle: string;
  heavy_drizzle: string;
  // PoP qualifier words (ids from popQualifier).
  pop_isolated: string;
  pop_scattered: string;
  pop_numerous: string;
  pop_likely: string;
  pop_slight_chance: string;
  pop_chance: string;
  // Qualifier + type composition patterns.
  pop_sentence_bare: (qualifier: string, type: string) => string;
  pop_sentence_of: (qualifier: string, type: string) => string;
  pop_sentence_likely: (type: string, likely: string) => string;
  pop_sentence_percent: (value: string) => string;
  // Visibility.
  fog_dense: string;
  fog_areas: string;
  fog_patchy: string;
  // Snow accumulation sentences and categorical ranges.
  snow_sentence: (range: string) => string;
  snow_sentence_possible: (range: string) => string;
  snow_none: string;
  snow_around_inch: string;
  snow_around_2cm: string;
  snow_more_than_2ft: string;
  snow_more_than_40cm: string;
  // Generic numeric range used by snow ranges and wind ranges.
  range: (a: string, b: string, unit: string) => string;
  // Rainfall total sentences.
  rain_sentence: (amount: string) => string;
  rain_sentence_possible: (amount: string) => string;
  // Unit words.
  unit_inch: string;
  unit_inches: string;
  unit_mm: string;
  unit_cm: string;
  unit_mph: string;
  unit_kph: string;
  // Temperature sentences and category templates.
  temp_highs: string;
  temp_lows: string;
  temp_rising: string;
  temp_falling: string;
  temp_single_digits: string;
  temp_around: (value: string) => string;
  temp_lower: (decade: string) => string;
  temp_mid: (decade: string) => string;
  temp_upper: (decade: string) => string;
  // Wind sentences. Direction entries are full prepositional phrases
  // (see note above); patterns place them per locale.
  wind_calm: string;
  wind_with_dir: (dir: string, range: string) => string;
  wind_no_dir: (range: string) => string;
  wind_gusts: (base: string, gust: string) => string;
  wind_up_to: (value: string, unit: string) => string;
  dir_north: string;
  dir_northeast: string;
  dir_east: string;
  dir_southeast: string;
  dir_south: string;
  dir_southwest: string;
  dir_west: string;
  dir_northwest: string;
  // Fallback / card labels.
  no_weather: string;
  short_fog: string;
  short_fair: string;
}

/** English reference dictionary. Also the fallback for missing keys. */
export const EN_DICT: ZfpDictionary = {
  sky_sunny: "sunny",
  sky_clear: "clear",
  sky_mostly_clear: "mostly clear",
  sky_partly_cloudy: "partly cloudy",
  sky_mostly_cloudy: "mostly cloudy",
  sky_cloudy: "cloudy",
  precip_snow: "snow",
  precip_rain: "rain",
  precip_rain_showers: "rain showers",
  precip_showers: "showers",
  precip_thunderstorms: "thunderstorms",
  precip_freezing_rain: "freezing rain",
  precip_freezing_drizzle: "freezing drizzle",
  precip_drizzle: "drizzle",
  precip_patchy_drizzle: "patchy drizzle",
  heavy_snow: "heavy snow",
  heavy_rain: "heavy rain",
  heavy_rain_showers: "heavy rain showers",
  heavy_showers: "heavy showers",
  heavy_thunderstorms: "heavy thunderstorms",
  heavy_freezing_rain: "heavy freezing rain",
  heavy_freezing_drizzle: "heavy freezing drizzle",
  heavy_drizzle: "heavy drizzle",
  pop_isolated: "isolated",
  pop_scattered: "scattered",
  pop_numerous: "numerous",
  pop_likely: "likely",
  pop_slight_chance: "slight chance",
  pop_chance: "chance",
  pop_sentence_bare: (qualifier, type) => `${qualifier} ${type}`,
  pop_sentence_of: (qualifier, type) => `${qualifier} of ${type}`,
  pop_sentence_likely: (type, likely) => `${type} ${likely}`,
  pop_sentence_percent: (value) =>
    `probability of precipitation ${value} percent`,
  fog_dense: "areas of dense fog",
  fog_areas: "areas of fog",
  fog_patchy: "patchy fog",
  snow_sentence: (range) => `snow accumulation of ${range}`,
  snow_sentence_possible: (range) => `possible snow accumulation of ${range}`,
  snow_none: "little or no accumulation",
  snow_around_inch: "around an inch",
  snow_around_2cm: "around 2 cm",
  snow_more_than_2ft: "more than 2 feet",
  snow_more_than_40cm: "more than 40 cm",
  range: (a, b, unit) => `${a} to ${b} ${unit}`,
  rain_sentence: (amount) => `rainfall amounts ${amount}`,
  rain_sentence_possible: (amount) => `possible rainfall amounts ${amount}`,
  unit_inch: "inch",
  unit_inches: "inches",
  unit_mm: "mm",
  unit_cm: "cm",
  unit_mph: "mph",
  unit_kph: "kph",
  temp_highs: "highs",
  temp_lows: "lows",
  temp_rising: "temperatures rising",
  temp_falling: "temperatures falling",
  temp_single_digits: "in the single digits",
  temp_around: (value) => `around ${value}`,
  temp_lower: (decade) => `in the lower ${decade}s`,
  temp_mid: (decade) => `in the mid ${decade}s`,
  temp_upper: (decade) => `in the upper ${decade}s`,
  wind_calm: "winds light and variable",
  wind_with_dir: (dir, range) => `${dir} winds ${range}`,
  wind_no_dir: (range) => `winds ${range}`,
  wind_gusts: (base, gust) => `${base} with gusts to ${gust}`,
  wind_up_to: (value, unit) => `up to ${value} ${unit}`,
  dir_north: "north",
  dir_northeast: "northeast",
  dir_east: "east",
  dir_southeast: "southeast",
  dir_south: "south",
  dir_southwest: "southwest",
  dir_west: "west",
  dir_northwest: "northwest",
  no_weather: "No significant weather.",
  short_fog: "fog",
  short_fair: "fair",
};

/**
 * Merge a partial locale dictionary over English so new locales only need
 * to translate a subset (missing keys read as English). The app-level
 * adapter always supplies a full dictionary; this is the safety net for
 * tests and future locales mid-translation.
 */
export function withFallback(partial: Partial<ZfpDictionary>): ZfpDictionary {
  return { ...EN_DICT, ...partial };
}
