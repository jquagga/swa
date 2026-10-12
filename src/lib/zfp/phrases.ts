import { EN_DICT, type ZfpDictionary } from "./dictionary.js";
import { celsiusToFahrenheit, kphToMph } from "./units.js";

export type Compass8 =
  | "north"
  | "northeast"
  | "east"
  | "southeast"
  | "south"
  | "southwest"
  | "west"
  | "northwest";

export function compass8(deg: number): Compass8 {
  const dirs: Compass8[] = [
    "north",
    "northeast",
    "east",
    "southeast",
    "south",
    "southwest",
    "west",
    "northwest",
  ];
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return dirs[i] ?? "north";
}

/**
 * Sky wording per ZFP Table 3 thresholds (percent opaque cover). Returns a
 * stable semantic id; the builder looks it up in the dictionary so the id
 * doubles as the English text.
 */
export function skyPhrase(
  cloudAvg: number | null,
  isDaytime: boolean,
): string | null {
  if (cloudAvg == null) return null;
  if (cloudAvg <= 5) return isDaytime ? "sunny" : "clear";
  if (cloudAvg <= 25) return isDaytime ? "mostly clear" : "mostly clear";
  if (cloudAvg <= 50) return isDaytime ? "partly cloudy" : "partly cloudy";
  if (cloudAvg <= 69) return isDaytime ? "mostly cloudy" : "mostly cloudy";
  if (cloudAvg <= 87) return "mostly cloudy";
  return isDaytime ? "cloudy" : "cloudy";
}

/** PoP qualifying term per ZFP Table 1. Returns a stable semantic id. */
export function popQualifier(
  popMax: number,
  convective: boolean,
): string | null {
  if (popMax < 15) return null;
  if (popMax <= 20) return convective ? "isolated" : "slight chance";
  if (popMax <= 50) return convective ? "scattered" : "chance";
  if (popMax <= 70) return convective ? "numerous" : "likely";
  return null; // 80%+ carries no qualifier
}

export type PrecipKind =
  | "snow"
  | "rain-showers"
  | "rain"
  | "showers"
  | "thunderstorms"
  | "freezing rain"
  | "freezing drizzle"
  | "drizzle"
  | null;

export function precipKind(
  precipMm: number,
  snowfallCm: number,
  showersMm: number,
): PrecipKind {
  if (snowfallCm >= 0.5) return "snow";
  if (precipMm < 0.2 && showersMm < 0.2) return null;
  if (showersMm >= 0.5 && precipMm < 1) return "showers";
  if (showersMm >= 0.5) return "rain-showers";
  return "rain";
}

/**
 * Temperature category per ZFP §1.5.4. US uses the spec's 20–99°F decade
 * bands; metric applies the same decade idea in °C. Single digits and the
 * 10–19 band use plain words ("in the single digits", "around 14") since
 * "0s"/"10s" read like typos and don't survive translation; sub-zero
 * values use "around" (decade math breaks on negatives).
 */
export function tempCategory(
  c: number,
  units: "metric" | "us",
  dict: ZfpDictionary = EN_DICT,
): string {
  if (units === "us") {
    const f = Math.round(celsiusToFahrenheit(c));
    if (f < 0 || f >= 100) return dict.temp_around(String(f));
    if (f < 10) return dict.temp_single_digits;
    if (f < 20) return dict.temp_around(String(f));
    return decadePhrase(Math.floor(f / 10) * 10, f % 10, dict);
  }
  const v = Math.round(c);
  if (v < 0) return dict.temp_around(String(v));
  if (v < 10) return dict.temp_single_digits;
  if (v < 20) return dict.temp_around(String(v));
  return decadePhrase(Math.floor(v / 10) * 10, ((v % 10) + 10) % 10, dict);
}

function decadePhrase(
  decade: number,
  ones: number,
  dict: ZfpDictionary,
): string {
  if (ones === 0) return dict.temp_around(String(decade));
  if (ones <= 3) return dict.temp_lower(String(decade));
  if (ones <= 6) return dict.temp_mid(String(decade));
  return dict.temp_upper(String(decade));
}

/** Numeric rainfall total for narratives. */
export function rainAmountPhrase(
  mm: number,
  units: "metric" | "us",
  dict: ZfpDictionary = EN_DICT,
): string {
  if (units === "us") {
    const inches = mm / 25.4;
    const text = inches < 10 ? inches.toFixed(2) : inches.toFixed(1);
    // Singular "inch" near 1.00 is English-specific (MVP documented).
    return `${text} ${inches < 1.05 && inches >= 0.95 ? dict.unit_inch : dict.unit_inches}`;
  }
  return `${mm < 10 ? mm.toFixed(1) : Math.round(mm)} ${dict.unit_mm}`;
}

/** Snow accumulation categorical phrasing (ZFP Table 4). */
export function snowRangePhrase(
  amount: number,
  units: "metric" | "us",
  dict: ZfpDictionary = EN_DICT,
): string {
  if (units === "us") {
    const inches = amount;
    if (inches < 0.5) return dict.snow_none;
    if (inches < 1.5) return dict.snow_around_inch;
    if (inches < 2.5) return dict.range("1", "3", dict.unit_inches);
    if (inches < 3.5) return dict.range("2", "4", dict.unit_inches);
    if (inches < 4.5) return dict.range("3", "5", dict.unit_inches);
    if (inches < 5.5) return dict.range("4", "6", dict.unit_inches);
    if (inches < 7.5) return dict.range("4", "8", dict.unit_inches);
    if (inches < 9.5) return dict.range("6", "10", dict.unit_inches);
    if (inches < 11.5) return dict.range("8", "12", dict.unit_inches);
    if (inches < 13.5) return dict.range("10", "14", dict.unit_inches);
    if (inches < 15.5) return dict.range("12", "16", dict.unit_inches);
    if (inches < 17.5) return dict.range("12", "18", dict.unit_inches);
    if (inches <= 24) return dict.range("18", "24", dict.unit_inches);
    return dict.snow_more_than_2ft;
  }
  const cm = amount;
  if (cm < 1) return dict.snow_none;
  if (cm < 3) return dict.snow_around_2cm;
  if (cm < 6) return dict.range("2", "6", dict.unit_cm);
  if (cm < 10) return dict.range("5", "10", dict.unit_cm);
  if (cm < 15) return dict.range("8", "15", dict.unit_cm);
  if (cm < 25) return dict.range("15", "25", dict.unit_cm);
  if (cm < 40) return dict.range("25", "40", dict.unit_cm);
  return dict.snow_more_than_40cm;
}

export interface WindPhrase {
  text: string;
  lightVariable: boolean;
}

/** Wind wording per ZFP §1.5.5 (8-pt compass). Ranges follow the spec buckets. */
export function windPhrase(
  dirDeg: number | null,
  kph: number | null,
  gustKph: number | null,
  units: "metric" | "us" = "us",
  dict: ZfpDictionary = EN_DICT,
): WindPhrase | null {
  if (kph == null) return null;
  if (units === "us") {
    const mph = kphToMph(kph);
    if (mph < 5) return { text: dict.wind_calm, lightVariable: true };
    const dir = dirDeg == null ? null : compass8(dirDeg);
    const lo = Math.floor(mph / 5) * 5;
    let range: string;
    if (mph < 20) range = dict.range(String(lo), String(lo + 5), dict.unit_mph);
    else if (mph < 40) {
      const base = Math.floor(mph / 10) * 10;
      range = dict.range(String(base), String(base + 10), dict.unit_mph);
    } else {
      const base = Math.floor(mph / 20) * 20;
      range = dict.range(String(base), String(base + 20), dict.unit_mph);
    }
    let text =
      dir == null
        ? dict.wind_no_dir(range)
        : dict.wind_with_dir(dirText(dir, dict), range);
    if (gustKph != null) {
      const gustMph = Math.round(kphToMph(gustKph));
      if (gustMph >= 20 && gustMph - mph >= 10) {
        text = dict.wind_gusts(text, `${gustMph} ${dict.unit_mph}`);
      }
    }
    return { text, lightVariable: false };
  }
  if (kph < 8) return { text: dict.wind_calm, lightVariable: true };
  const dir = dirDeg == null ? null : compass8(dirDeg);
  const lo = Math.floor(kph / 10) * 10;
  const range =
    lo === 0
      ? dict.wind_up_to("10", dict.unit_kph)
      : dict.range(String(lo), String(lo + 10), dict.unit_kph);
  let text =
    dir == null
      ? dict.wind_no_dir(range)
      : dict.wind_with_dir(dirText(dir, dict), range);
  if (gustKph != null) {
    const gust = Math.round(gustKph);
    if (gust >= 32 && gust - kph >= 16) {
      text = dict.wind_gusts(text, `${gust} ${dict.unit_kph}`);
    }
  }
  return { text, lightVariable: false };
}

/** Map a skyPhrase id to localized text. */
export function skyText(id: string, dict: ZfpDictionary): string {
  switch (id) {
    case "sunny":
      return dict.sky_sunny;
    case "clear":
      return dict.sky_clear;
    case "mostly clear":
      return dict.sky_mostly_clear;
    case "partly cloudy":
      return dict.sky_partly_cloudy;
    case "mostly cloudy":
      return dict.sky_mostly_cloudy;
    default:
      return dict.sky_cloudy;
  }
}

/** Map a popQualifier id to its localized qualifier word. */
export function popText(id: string, dict: ZfpDictionary): string {
  switch (id) {
    case "isolated":
      return dict.pop_isolated;
    case "scattered":
      return dict.pop_scattered;
    case "numerous":
      return dict.pop_numerous;
    case "likely":
      return dict.pop_likely;
    case "slight chance":
      return dict.pop_slight_chance;
    default:
      return dict.pop_chance;
  }
}

/** Localized compass point. Dictionary entries carry the locale's
 * preposition/article contract (en "northeast", es "del noreste"). */
export function dirText(dir: Compass8, dict: ZfpDictionary): string {
  switch (dir) {
    case "north":
      return dict.dir_north;
    case "northeast":
      return dict.dir_northeast;
    case "east":
      return dict.dir_east;
    case "southeast":
      return dict.dir_southeast;
    case "south":
      return dict.dir_south;
    case "southwest":
      return dict.dir_southwest;
    case "west":
      return dict.dir_west;
    case "northwest":
      return dict.dir_northwest;
  }
}
