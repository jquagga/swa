import { EN_DICT, type ZfpDictionary } from "./dictionary.js";
import { cmToInches } from "./units.js";
import {
  dirText,
  popQualifier,
  popText,
  precipKind,
  rainAmountPhrase,
  skyPhrase,
  skyText,
  snowRangePhrase,
  tempCategory,
  windPhrase,
  type PrecipKind,
} from "./phrases.js";
import type { DisplayUnits, PeriodSummary } from "./types.js";

export interface Narrative {
  /** Full sentence chain for the period in the dictionary locale. */
  text: string;
  /** Short label for cards/hero (sky + precip). */
  shortForecast: string;
}

/**
 * Assemble a ZFP-style narrative from a localized dictionary. Keeps the
 * spec subset: sky, PoP + precip type/intensity, temp category + trend,
 * wind (+gusts), snow. All human-readable strings come from `dict` — no
 * English literals here — so new locales only add messages, never code.
 * `locale` is the BCP-47 tag used for sentence casing (e.g. Turkish
 * dotted-I); it defaults to English.
 */
export function buildNarrative(
  s: PeriodSummary,
  periodIndex: number,
  units: DisplayUnits = "metric",
  dict: ZfpDictionary = EN_DICT,
  locale = "en",
): Narrative {
  void periodIndex;
  const w = s.wmo;
  const convective = s.showersSumMm >= 0.5 || w.thunderFrac >= 0.1;
  const { kind, heavy } = resolveKind(s);
  const qualifier = popQualifier(s.popMax, convective);
  const skyId =
    s.cloudAvg != null ? skyPhrase(s.cloudAvg, s.period.isDaytime) : null;
  const sky = skyId == null ? null : skyText(skyId, dict);
  // Sky is optional when PoP dominates the period.
  const showSky = sky != null && !(s.popMax >= 60);

  const parts: string[] = [];

  // Weather sentence. High-PoP periods (80%+) carry no qualifier per
  // ZFP Table 1, so they state the bare type. Amounts alone
  // can't see thunder/fog/freezing events, so a confident WMO signal also
  // opens the gate even when PoP is low (trace drizzle, dry thunderstorms).
  if (kind && (s.popMax >= 15 || w.precipFrac >= 0.25)) {
    const patchy = kind === "drizzle" && !qualifier && w.drizzleFrac < 0.4;
    const typeText = precipText(kind, heavy, patchy, dict);
    if (qualifier) {
      if (qualifier === "likely") {
        parts.push(
          dict.pop_sentence_likely(typeText, popText(qualifier, dict)),
        );
      } else if (
        qualifier === "isolated" ||
        qualifier === "scattered" ||
        qualifier === "numerous"
      ) {
        parts.push(dict.pop_sentence_bare(popText(qualifier, dict), typeText));
      } else {
        parts.push(dict.pop_sentence_of(popText(qualifier, dict), typeText));
      }
    } else {
      parts.push(typeText);
    }
    if (s.popMax >= 20) {
      parts.push(dict.pop_sentence_percent(String(s.popMax)));
    }
  } else if (showSky && sky) {
    parts.push(sky);
  } else if (sky && kind) {
    parts.push(sky);
  }

  // Visibility restriction. WMO fog joins the existing visibility rule;
  // code 48 (rime fog) always reads dense.
  const fogDense =
    (s.visibilityMinM != null && s.visibilityMinM <= 400) ||
    w.denseFogFrac >= 0.25;
  const fogText = !(
    w.fogFrac >= 0.25 ||
    (s.visibilityMinM != null && s.visibilityMinM <= 1000)
  )
    ? null
    : fogDense
      ? dict.fog_dense
      : w.fogFrac >= 0.5
        ? dict.fog_areas
        : dict.fog_patchy;
  if (fogText) parts.push(fogText);

  // Snow accumulation (explicit when PoP met). Thresholds stay in display
  // units so the gate matches what the reader sees (~1 cm either way).
  if (kind === "snow" && s.popMax >= 30) {
    const amount =
      units === "us" ? cmToInches(s.snowfallSumCm) : s.snowfallSumCm;
    const threshold = units === "us" ? 0.5 : 1;
    if (amount >= threshold) {
      const sentence =
        s.popMax < 60 ? dict.snow_sentence_possible : dict.snow_sentence;
      parts.push(sentence(snowRangePhrase(amount, units, dict)));
    }
  }

  // Rainfall amounts for liquid kinds. Unlike snow (categorical Table 4
  // ranges), rain reads as a numeric period total; US inches always carry
  // at least one decimal place. The gate is a tenth of an inch (2.5 mm) —
  // the NWS "measurable rain" line — so high-PoP periods with a fifth of
  // an inch still report instead of going silent.
  const liquidKind =
    kind === "rain" ||
    kind === "rain-showers" ||
    kind === "showers" ||
    kind === "thunderstorms" ||
    kind === "freezing rain";
  if (liquidKind && s.popMax >= 30 && s.precipSumMm >= 2.5) {
    const sentence =
      s.popMax < 60 ? dict.rain_sentence_possible : dict.rain_sentence;
    parts.push(sentence(rainAmountPhrase(s.precipSumMm, units, dict)));
  }

  // Temperature sentence.
  const anchor = s.period.isDaytime
    ? (s.tMaxC ?? s.tAvgC)
    : (s.tMinC ?? s.tAvgC);
  if (anchor != null) {
    const label = s.period.isDaytime ? dict.temp_highs : dict.temp_lows;
    parts.push(`${label} ${tempCategory(anchor, units, dict)}`);
    if (
      s.trendC != null &&
      Math.abs(s.trendC) >= 2 &&
      s.period.hours.length >= 6
    ) {
      parts.push(s.trendC > 0 ? dict.temp_rising : dict.temp_falling);
    }
  }

  // Wind sentence.
  const wind = windPhrase(s.windDirDeg, s.windKph, s.windGustKph, units, dict);
  if (wind) parts.push(wind.text);

  const text =
    capitalizeSentences(
      parts.filter(Boolean).map(ensurePeriod).join(" ").trim(),
      locale,
    ) || capitalizeSentences(ensurePeriod(dict.no_weather), locale);
  const shortForecast = shortLabel(
    kind,
    qualifier,
    heavy,
    fogText != null,
    showSky,
    sky,
    dict,
    locale,
  );
  return { text, shortForecast };
}

/** Resolve a precip kind to localized display text, honouring heavy. */
function precipText(
  kind: Exclude<PrecipKind, null>,
  heavy: boolean,
  patchy: boolean,
  dict: ZfpDictionary,
): string {
  if (heavy) {
    switch (kind) {
      case "snow":
        return dict.heavy_snow;
      case "rain":
        return dict.heavy_rain;
      case "rain-showers":
        return dict.heavy_rain_showers;
      case "showers":
        return dict.heavy_showers;
      case "thunderstorms":
        return dict.heavy_thunderstorms;
      case "freezing rain":
        return dict.heavy_freezing_rain;
      case "freezing drizzle":
        return dict.heavy_freezing_drizzle;
      case "drizzle":
        return dict.heavy_drizzle;
    }
  }
  switch (kind) {
    case "snow":
      return dict.precip_snow;
    case "rain":
      return dict.precip_rain;
    case "rain-showers":
      return dict.precip_rain_showers;
    case "showers":
      return dict.precip_showers;
    case "thunderstorms":
      return dict.precip_thunderstorms;
    case "freezing rain":
      return dict.precip_freezing_rain;
    case "freezing drizzle":
      return dict.precip_freezing_drizzle;
    case "drizzle":
      return patchy ? dict.precip_patchy_drizzle : dict.precip_drizzle;
  }
}

/**
 * Merge amount-based and WMO-code evidence into one precip kind.
 * Thunderstorms and freezing precipitation win on a modest WMO fraction
 * even when amounts point at plain rain; drizzle needs no amounts at all.
 */
function resolveKind(s: PeriodSummary): { kind: PrecipKind; heavy: boolean } {
  const w = s.wmo;
  const heavy = w.heavyFrac >= 0.2;
  if (w.thunderFrac >= 0.15) return { kind: "thunderstorms", heavy };
  if (w.freezingRainFrac >= 0.2) return { kind: "freezing rain", heavy };
  const amount = precipKind(s.precipSumMm, s.snowfallSumCm, s.showersSumMm);
  if (amount === "snow") return { kind: "snow", heavy };
  if (w.freezingDrizzleFrac >= 0.25) return { kind: "freezing drizzle", heavy };
  if (amount === "rain" || amount === "rain-showers" || amount === "showers") {
    return { kind: amount, heavy };
  }
  if (w.drizzleFrac >= 0.25) return { kind: "drizzle", heavy };
  return { kind: null, heavy: false };
}

/** Areal qualifiers read bare; the rest take the "of" pattern. */
function shortLabel(
  kind: PrecipKind,
  qualifier: string | null,
  heavy: boolean,
  foggy: boolean,
  showSky: boolean,
  sky: string | null,
  dict: ZfpDictionary,
  locale: string,
): string {
  const kindText = kind == null ? null : precipText(kind, heavy, false, dict);
  if (kindText) {
    if (!qualifier) return capitalize(kindText, locale);
    if (
      qualifier === "isolated" ||
      qualifier === "scattered" ||
      qualifier === "numerous"
    ) {
      return capitalize(
        dict.pop_sentence_bare(popText(qualifier, dict), kindText),
        locale,
      );
    }
    if (qualifier === "likely")
      return capitalize(
        dict.pop_sentence_likely(kindText, popText(qualifier, dict)),
        locale,
      );
    return capitalize(
      dict.pop_sentence_of(popText(qualifier, dict), kindText),
      locale,
    );
  }
  if (foggy) return capitalize(dict.short_fog, locale);
  if (showSky && sky) return capitalize(sky, locale);
  if (sky) return capitalize(sky, locale);
  return capitalize(dict.short_fair, locale);
}

function upperChar(c: string, locale: string): string {
  try {
    return c.toLocaleUpperCase(locale);
  } catch {
    return c.toUpperCase();
  }
}

function upperFirst(s: string, locale: string): string {
  if (!s) return s;
  const [first, ...rest] = [...s];
  return upperChar(first ?? "", locale) + rest.join("");
}

function capitalizeSentences(s: string, locale: string): string {
  if (!s) return s;
  return upperFirst(s, locale).replace(
    /\. (\p{L})/gu,
    (_, c: string) => `. ${upperChar(c, locale)}`,
  );
}

function capitalize(s: string, locale: string): string {
  return upperFirst(s, locale);
}

function ensurePeriod(s: string): string {
  return s.endsWith(".") ? s : `${s}.`;
}

// Re-export for callers that render compass labels outside narratives.
export { dirText };
