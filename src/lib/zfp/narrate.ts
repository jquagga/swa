import { cmToInches } from "./units.js";
import {
  popQualifier,
  precipKind,
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
  const convective = s.showersSumMm >= 0.5;
  const kind = precipKind(s.precipSumMm, s.snowfallSumCm, s.showersSumMm);
  const qualifier = popQualifier(s.popMax, convective);
  const sky = skyPhrase(s.cloudAvg, s.period.isDaytime);
  // Sky is optional when PoP dominates the period.
  const showSky = sky != null && !(s.popMax >= 60);

  const parts: string[] = [];

  // Weather sentence. High-PoP periods (80%+) carry no qualifier per
  // ZFP Table 1, so they state the bare type ("Rain.").
  if (kind && s.popMax >= 15) {
    const typeText =
      kind === "snow"
        ? "snow"
        : kind === "rain-showers"
          ? "rain showers"
          : kind === "showers"
            ? "showers"
            : "rain";
    if (qualifier) {
      if (qualifier === "likely") {
        parts.push(`${capitalize(typeText)} likely`);
      } else if (
        qualifier === "isolated" ||
        qualifier === "scattered" ||
        qualifier === "numerous"
      ) {
        parts.push(`${capitalize(qualifier)} ${typeText}`);
      } else {
        parts.push(`${capitalize(qualifier)} of ${typeText}`);
      }
    } else {
      parts.push(capitalize(typeText));
    }
    if (s.popMax >= 20) {
      parts.push(`probability of precipitation ${s.popMax} percent`);
    }
  } else if (showSky && sky) {
    parts.push(capitalize(sky));
  } else if (sky && kind) {
    parts.push(capitalize(sky));
  }

  // Snow accumulation (explicit in first three periods when PoP met).
  if (kind === "snow" && periodIndex < 3 && s.popMax >= 30) {
    const amount = units === "us" ? cmToInches(s.snowfallSumCm) : s.snowfallSumCm;
    const threshold = units === "us" ? 0.5 : 1;
    if (amount >= threshold) {
      const possible = s.popMax < 60 ? "possible " : "";
      parts.push(`${possible}snow accumulation of ${snowRangePhrase(amount, units)}`);
    }
  }

  // Temperature sentence.
  const anchor = s.period.isDaytime ? (s.tMaxC ?? s.tAvgC) : (s.tMinC ?? s.tAvgC);
  if (anchor != null) {
    const label = s.period.isDaytime ? "highs" : "lows";
    parts.push(`${label} ${tempCategory(anchor, units)}`);
    if (s.trendC != null && Math.abs(s.trendC) >= 2 && s.period.hours.length >= 6) {
      parts.push(s.trendC > 0 ? "temperatures rising" : "temperatures falling");
    }
  }

  // Wind sentence.
  const wind = windPhrase(s.windDirDeg, s.windKph, s.windGustKph, units);
  if (wind) parts.push(wind.text);

  // Visibility restriction (dense fog / haze only at MVP).
  if (s.visibilityMinM != null && s.visibilityMinM <= 400) {
    parts.push("areas of dense fog");
  } else if (s.visibilityMinM != null && s.visibilityMinM <= 1000) {
    parts.push("patchy fog");
  }

  const text = capitalizeSentences(parts.filter(Boolean).map(ensurePeriod).join(" ").trim()) ||
    "No significant weather.";
  const shortForecast = shortLabel(kind, qualifier, showSky, sky);
  return { text, shortForecast };
}

/** Areal qualifiers read bare ("Isolated showers"); the rest take "of". */
function shortLabel(
  kind: PrecipKind,
  qualifier: string | null,
  showSky: boolean,
  sky: string | null,
): string {
  const kindText = kind === "rain-showers" ? "rain showers" : kind;
  if (kindText) {
    if (!qualifier) return capitalize(kindText);
    if (qualifier === "isolated" || qualifier === "scattered" || qualifier === "numerous") {
      return `${capitalize(qualifier)} ${kindText}`;
    }
    if (qualifier === "likely") return `Likely ${kindText}`;
    return `${capitalize(qualifier)} of ${kindText}`;
  }
  if (showSky && sky) return capitalize(sky);
  if (sky) return capitalize(sky);
  return "Fair";
}

function capitalizeSentences(s: string): string {
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1).replace(/\. ([a-z])/g, (_, c: string) => `. ${c.toUpperCase()}`);
}

function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function ensurePeriod(s: string): string {
  return s.endsWith(".") ? s : `${s}.`;
}
