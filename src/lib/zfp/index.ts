import { buildNarrative } from "./narrate.js";
import { summarizeAll } from "./periods.js";
import { translateNarrative } from "./translator.js";
import type {
  DisplayUnits,
  HourlySeries,
  PeriodSummary,
  SupportedZfpLocale,
} from "./types.js";

export * from "./types.js";
export {
  summarizeAll,
  splitDayNight,
  summarizePeriod,
  localHour,
} from "./periods.js";
export { summarizeWmo, type WmoSummary } from "./wmo.js";
export { buildNarrative } from "./narrate.js";
export { translateNarrative } from "./translator.js";
export * from "./units.js";

export interface ForecastPeriod {
  summary: PeriodSummary;
  narrativeEn: string;
  /** Narrative in the requested locale. */
  narrative: string;
  shortEn: string;
  short: string;
}

/** Full pipeline: summarize day/night periods and narrate each one. */
export function buildForecast(
  series: HourlySeries,
  options: {
    locale?: SupportedZfpLocale;
    units?: DisplayUnits;
    nowMs?: number;
  } = {},
): ForecastPeriod[] {
  const { locale = "en", units = "metric", nowMs = Date.now() } = options;
  return summarizeAll(series, nowMs).map((summary, i) => {
    const { text, shortForecast } = buildNarrative(summary, i, units);
    return {
      summary,
      narrativeEn: text,
      narrative: translateNarrative(text, locale),
      shortEn: shortForecast,
      short: translateNarrative(shortForecast, locale),
    };
  });
}
