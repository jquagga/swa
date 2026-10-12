import { EN_DICT, type ZfpDictionary } from "./dictionary.js";
import { buildNarrative } from "./narrate.js";
import { summarizeAll } from "./periods.js";
import type { DisplayUnits, HourlySeries, PeriodSummary } from "./types.js";

export * from "./types.js";
export {
  summarizeAll,
  splitDayNight,
  summarizePeriod,
  localHour,
} from "./periods.js";
export { summarizeWmo, type WmoSummary } from "./wmo.js";
export { buildNarrative } from "./narrate.js";
export { EN_DICT, withFallback, type ZfpDictionary } from "./dictionary.js";
export * from "./units.js";

export interface ForecastPeriod {
  summary: PeriodSummary;
  narrativeEn: string;
  /** Narrative in the dictionary locale. */
  narrative: string;
  shortEn: string;
  short: string;
}

/**
 * Full pipeline: summarize day/night periods and narrate each one.
 * The dictionary supplies every human-readable string (built by the
 * app-level Paraglide adapter); English output always comes from EN_DICT
 * so card emoji matching stays anchored to `shortEn`. `locale` is the
 * BCP-47 tag for sentence casing of the localized output.
 */
export function buildForecast(
  series: HourlySeries,
  options: {
    dictionary?: ZfpDictionary;
    units?: DisplayUnits;
    nowMs?: number;
    locale?: string;
  } = {},
): ForecastPeriod[] {
  const {
    dictionary = EN_DICT,
    units = "metric",
    nowMs = Date.now(),
    locale = "en",
  } = options;
  return summarizeAll(series, nowMs).map((summary, i) => {
    const { text, shortForecast } = buildNarrative(
      summary,
      i,
      units,
      dictionary,
      locale,
    );
    const en = buildNarrative(summary, i, units, EN_DICT, "en");
    return {
      summary,
      narrativeEn: en.text,
      narrative: text,
      shortEn: en.shortForecast,
      short: shortForecast,
    };
  });
}
