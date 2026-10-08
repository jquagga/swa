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
  return dirs[i];
}

/** Sky wording per ZFP Table 3 thresholds (percent opaque cover). */
export function skyPhrase(cloudAvg: number | null, isDaytime: boolean): string | null {
  if (cloudAvg == null) return null;
  if (cloudAvg <= 5) return isDaytime ? "sunny" : "clear";
  if (cloudAvg <= 25) return isDaytime ? "mostly clear" : "mostly clear";
  if (cloudAvg <= 50) return isDaytime ? "partly cloudy" : "partly cloudy";
  if (cloudAvg <= 69) return isDaytime ? "mostly cloudy" : "mostly cloudy";
  if (cloudAvg <= 87) return "mostly cloudy";
  return isDaytime ? "cloudy" : "cloudy";
}

/** PoP qualifying term per ZFP Table 1. */
export function popQualifier(popMax: number, convective: boolean): string | null {
  if (popMax < 15) return null;
  if (popMax <= 20) return convective ? "isolated" : "slight chance";
  if (popMax <= 50) return convective ? "scattered" : "chance";
  if (popMax <= 70) return convective ? "numerous" : "likely";
  return null; // 80%+ carries no qualifier
}

export type PrecipKind = "snow" | "rain-showers" | "rain" | "showers" | null;

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
export function tempCategory(c: number, units: "metric" | "us"): string {
  if (units === "us") {
    const f = Math.round(celsiusToFahrenheit(c));
    if (f < 0 || f >= 100) return `around ${f}`;
    if (f < 10) return "in the single digits";
    if (f < 20) return `around ${f}`;
    return decadePhrase(Math.floor(f / 10) * 10, f % 10);
  }
  const v = Math.round(c);
  if (v < 0) return `around ${v}`;
  if (v < 10) return "in the single digits";
  if (v < 20) return `around ${v}`;
  return decadePhrase(Math.floor(v / 10) * 10, ((v % 10) + 10) % 10);
}

function decadePhrase(decade: number, ones: number): string {
  if (ones === 0) return `around ${decade}`;
  if (ones <= 3) return `in the lower ${decade}s`;
  if (ones <= 6) return `in the mid ${decade}s`;
  return `in the upper ${decade}s`;
}

/** Snow accumulation categorical phrasing (ZFP Table 4). */
export function snowRangePhrase(amount: number, units: "metric" | "us"): string {
  if (units === "us") {
    const inches = amount;
    if (inches < 0.5) return "little or no accumulation";
    if (inches < 1.5) return "around an inch";
    if (inches < 2.5) return "1 to 3 inches";
    if (inches < 3.5) return "2 to 4 inches";
    if (inches < 4.5) return "3 to 5 inches";
    if (inches < 5.5) return "4 to 6 inches";
    if (inches < 7.5) return "4 to 8 inches";
    if (inches < 9.5) return "6 to 10 inches";
    if (inches < 11.5) return "8 to 12 inches";
    if (inches < 13.5) return "10 to 14 inches";
    if (inches < 15.5) return "12 to 16 inches";
    if (inches < 17.5) return "12 to 18 inches";
    if (inches <= 24) return "18 to 24 inches";
    return "more than 2 feet";
  }
  const cm = amount;
  if (cm < 1) return "little or no accumulation";
  if (cm < 3) return "around 2 cm";
  if (cm < 6) return "2 to 6 cm";
  if (cm < 10) return "5 to 10 cm";
  if (cm < 15) return "8 to 15 cm";
  if (cm < 25) return "15 to 25 cm";
  if (cm < 40) return "25 to 40 cm";
  return "more than 40 cm";
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
): WindPhrase | null {
  if (kph == null) return null;
  if (units === "us") {
    const mph = kphToMph(kph);
    if (mph < 5) return { text: "light and variable", lightVariable: true };
    const dir = dirDeg == null ? null : compass8(dirDeg);
    const lo = Math.floor(mph / 5) * 5;
    let range: string;
    if (mph < 20) range = `${lo} to ${lo + 5} mph`;
    else if (mph < 40) range = `${Math.floor(mph / 10) * 10} to ${Math.floor(mph / 10) * 10 + 10} mph`;
    else range = `${Math.floor(mph / 20) * 20} to ${Math.floor(mph / 20) * 20 + 20} mph`;
    let text = dir ? `${dir} winds ${range}` : `winds ${range}`;
    if (gustKph != null) {
      const gustMph = Math.round(kphToMph(gustKph));
      if (gustMph >= 20 && gustMph - mph >= 10) {
        text += ` with gusts to ${gustMph} mph`;
      }
    }
    return { text, lightVariable: false };
  }
  if (kph < 8) return { text: "light and variable", lightVariable: true };
  const dir = dirDeg == null ? null : compass8(dirDeg);
  const lo = Math.floor(kph / 10) * 10;
  const range = lo === 0 ? "up to 10 kph" : `${lo} to ${lo + 10} kph`;
  let text = dir ? `${dir} winds ${range}` : `winds ${range}`;
  if (gustKph != null) {
    const gust = Math.round(gustKph);
    if (gust >= 32 && gust - kph >= 16) {
      text += ` with gusts to ${gust} kph`;
    }
  }
  return { text, lightVariable: false };
}
