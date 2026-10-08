// Framework-free Zone-Forecast-Product-style narrative library.
// Input is always metric (Open-Meteo native). Unit conversion happens only
// at the display edge, never inside samplers.
// Based in part on com.raytheon.viz.gfe Translator.py (Unidata AWIPS2),
// used as reference per its license; see NOTICE in repo root.

export interface HourlySeries {
  timeMs: number[];
  /** °C */
  temperatureC: (number | null)[];
  /** % */
  humidity: (number | null)[];
  /** °C feels-like */
  apparentC: (number | null)[];
  /** % */
  pop: (number | null)[];
  /** mm total liquid-equivalent */
  precipMm: (number | null)[];
  rainMm: (number | null)[];
  showersMm: (number | null)[];
  /** cm */
  snowfallCm: (number | null)[];
  /** % total cloud */
  cloudCover: (number | null)[];
  cloudLow: (number | null)[];
  cloudMid: (number | null)[];
  cloudHigh: (number | null)[];
  /** kph */
  windKph: (number | null)[];
  /** degrees */
  windDeg: (number | null)[];
  /** kph */
  windGustKph: (number | null)[];
  /** meters */
  visibilityM: (number | null)[];
  isDay: (number | null)[];
  timeZone?: string;
}

export interface ZfpPeriod {
  index: number;
  isDaytime: boolean;
  startMs: number;
  endMs: number;
  /** indices into the HourlySeries arrays */
  hours: number[];
}

export interface PeriodSummary {
  period: ZfpPeriod;
  tMinC: number | null;
  tMaxC: number | null;
  tAvgC: number | null;
  /** second-half minus first-half mean, °C */
  trendC: number | null;
  popMax: number;
  precipSumMm: number;
  snowfallSumCm: number;
  showersSumMm: number;
  cloudAvg: number | null;
  windDirDeg: number | null;
  windKph: number | null;
  windGustKph: number | null;
  humidityAvg: number | null;
  visibilityMinM: number | null;
}

export type SupportedZfpLocale = "en" | "es" | "fr";
export type DisplayUnits = "metric" | "us";
