import { cmToInches } from "./units.js";
import {
  popQualifier,
  precipKind,
  rainAmountPhrase,
  skyPhrase,
  snowRangePhrase,
  tempCategory,
  windPhrase,
  type PrecipKind,
} from "./phrases.js";
import type { DisplayUnits, PeriodSummary } from "./types.js";

export interface Narrative {
  /** Full English sentence chain for the period. */
  text: string;
  /** Short label for cards/hero (sky + precip). */
  shortForecast: string;
}

/**
 * Assemble a ZFP-style narrative in English. Callers translate via
 * `translateNarrative()` for es/fr. Keeps the spec subset: sky, PoP +
 * precip type/intensity, temp category + trend, wind (+gusts), snow.
 */
export function buildNarrative(
  s: PeriodSummary,
  periodIndex: number,
  units: DisplayUnits = "metric",
): Narrative {
  const w = s.wmo;
  const convective = s.showersSumMm >= 0.5 || w.thunderFrac >= 0.1;
  const { kind, heavy } = resolveKind(s);
  const qualifier = popQualifier(s.popMax, convective);
  const sky = skyPhrase(s.cloudAvg, s.period.isDaytime);
  // Sky is optional when PoP dominates the period.
  const showSky = sky != null && !(s.popMax >= 60);

  const parts: string[] = [];

  // Weather sentence. High-PoP periods (80%+) carry no qualifier per
  // ZFP Table 1, so they state the bare type ("Rain."). Amounts alone
  // can't see thunder/fog/freezing events, so a confident WMO signal also
  // opens the gate even when PoP is low (trace drizzle, dry thunderstorms).
  if (kind && (s.popMax >= 15 || w.precipFrac >= 0.25)) {
    const heavyPrefix = heavy ? "heavy " : "";
    const typeText =
      kind === "rain-showers"
        ? "rain showers"
        : kind === "drizzle" && !qualifier && w.drizzleFrac < 0.4
          ? "patchy drizzle"
          : kind;
    if (qualifier) {
      if (qualifier === "likely") {
        parts.push(`${capitalize(heavyPrefix + typeText)} likely`);
      } else if (
        qualifier === "isolated" ||
        qualifier === "scattered" ||
        qualifier === "numerous"
      ) {
        parts.push(`${capitalize(qualifier)} ${heavyPrefix}${typeText}`);
      } else {
        parts.push(`${capitalize(qualifier)} of ${heavyPrefix}${typeText}`);
      }
    } else {
      parts.push(capitalize(heavyPrefix + typeText));
    }
    if (s.popMax >= 20) {
      parts.push(`probability of precipitation ${s.popMax} percent`);
    }
  } else if (showSky && sky) {
    parts.push(capitalize(sky));
  } else if (sky && kind) {
    parts.push(capitalize(sky));
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
      ? "areas of dense fog"
      : w.fogFrac >= 0.5
        ? "areas of fog"
        : "patchy fog";
  if (fogText) parts.push(fogText);

  // Snow accumulation (explicit when PoP met). Thresholds stay in display
  // units so the gate matches what the reader sees (~1 cm either way).
  if (kind === "snow" && s.popMax >= 30) {
    const amount =
      units === "us" ? cmToInches(s.snowfallSumCm) : s.snowfallSumCm;
    const threshold = units === "us" ? 0.5 : 1;
    if (amount >= threshold) {
      const possible = s.popMax < 60 ? "possible " : "";
      parts.push(
        `${possible}snow accumulation of ${snowRangePhrase(amount, units)}`,
      );
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
    const possible = s.popMax < 60 ? "possible " : "";
    parts.push(
      `${possible}rainfall amounts ${rainAmountPhrase(s.precipSumMm, units)}`,
    );
  }

  // Temperature sentence.
  const anchor = s.period.isDaytime
    ? (s.tMaxC ?? s.tAvgC)
    : (s.tMinC ?? s.tAvgC);
  if (anchor != null) {
    const label = s.period.isDaytime ? "highs" : "lows";
    parts.push(`${label} ${tempCategory(anchor, units)}`);
    if (
      s.trendC != null &&
      Math.abs(s.trendC) >= 2 &&
      s.period.hours.length >= 6
    ) {
      parts.push(s.trendC > 0 ? "temperatures rising" : "temperatures falling");
    }
  }

  // Wind sentence.
  const wind = windPhrase(s.windDirDeg, s.windKph, s.windGustKph, units);
  if (wind) parts.push(wind.text);

  const text =
    capitalizeSentences(
      parts.filter(Boolean).map(ensurePeriod).join(" ").trim(),
    ) || "No significant weather.";
  const shortForecast = shortLabel(
    kind,
    qualifier,
    heavy,
    !!fogText,
    showSky,
    sky,
  );
  return { text, shortForecast };
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

/** Areal qualifiers read bare ("Isolated showers"); the rest take "of". */
function shortLabel(
  kind: PrecipKind,
  qualifier: string | null,
  heavy: boolean,
  foggy: boolean,
  showSky: boolean,
  sky: string | null,
): string {
  const heavyPrefix = heavy ? "Heavy " : "";
  const kindText = kind === "rain-showers" ? "rain showers" : kind;
  if (kindText) {
    if (!qualifier) return capitalize(heavyPrefix + kindText);
    if (
      qualifier === "isolated" ||
      qualifier === "scattered" ||
      qualifier === "numerous"
    ) {
      return `${capitalize(qualifier)} ${heavyPrefix}${kindText}`;
    }
    if (qualifier === "likely") return `Likely ${heavyPrefix}${kindText}`;
    return `${capitalize(qualifier)} of ${heavyPrefix}${kindText}`;
  }
  if (foggy) return "Fog";
  if (showSky && sky) return capitalize(sky);
  if (sky) return capitalize(sky);
  return "Fair";
}

function capitalizeSentences(s: string): string {
  if (!s) return s;
  return (
    s[0].toUpperCase() +
    s.slice(1).replace(/\. ([a-z])/g, (_, c: string) => `. ${c.toUpperCase()}`)
  );
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function ensurePeriod(s: string): string {
  return s.endsWith(".") ? s : `${s}.`;
}
