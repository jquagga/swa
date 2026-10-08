// Narrative translation for es/fr.
// Method ported from AWIPS Translator.py (com.raytheon.viz.gfe
// localization/gfe/userPython/textUtilities/Translator.py, Unidata AWIPS2),
// used as reference: lowercase English → ordered expression replacement →
// cleanup → sentence capitalization. French accents restored and obvious
// Spanish typos fixed; gender-agreement matrix intentionally simplified for
// MVP (single-form nouns). See NOTICE.
// English is passthrough.

import type { SupportedZfpLocale } from "./types.js";

type Pair = [string, string];

const ES_EXPRESSIONS: Pair[] = [
  ["mostly sunny", "mayormente soleado"],
  ["mostly clear", "mayormente despejado"],
  ["mostly cloudy", "mayormente nublado"],
  ["partly cloudy", "parcialmente nublado"],
  ["sunny", "soleado"],
  ["clearing", "despejándose"],
  ["clear", "despejado"],
  ["cloudy", "nublado"],
  ["snow accumulation of", "acumulación de nieve de"],
  ["possible ", "posible "],
  ["around an inch", "alrededor de una pulgada"],
  ["around 2 cm", "alrededor de 2 cm"],
  ["little or no accumulation", "poca o ninguna acumulación"],
  ["more than 2 feet", "más de 2 pies"],
  ["more than 40 cm", "más de 40 cm"],
  ["probability of precipitation", "probabilidad de precipitación"],
  ["slight chance of", "leve probabilidad de"],
  ["chance of", "probabilidad de"],
  ["heavy", "intenso"],
  ["freezing rain", "lluvia helada"],
  ["freezing drizzle", "llovizna helada"],
  ["patchy drizzle", "llovizna esparcida"],
  ["drizzle", "llovizna"],
  ["thunderstorms", "tormentas"],
  ["rain showers", "chubascos"],
  ["showers", "chubascos"],
  ["rain", "lluvia"],
  ["snow", "nieve"],
  ["isolated", "aislado"],
  ["scattered", "disperso"],
  ["numerous", "numeroso"],
  ["likely", "probable"],
  ["in the single digits", "de un solo dígito"],
  ["in the lower", "en los bajos"],
  ["in the mid", "en los medios"],
  ["in the upper", "en los altos"],
  ["in the", "en los"],
  ["around", "alrededor de"],
  ["highs", "máximas"],
  ["lows", "mínimas"],
  ["temperatures rising", "temperaturas en aumento"],
  ["temperatures falling", "temperaturas en descenso"],
  ["light and variable", "vientos ligeros y variables"],
  ["up to 10 kph", "hasta 10 kph"],
  ["with gusts to", "con ráfagas de"],
  ["northeast winds", "vientos del noreste"],
  ["northwest winds", "vientos del noroeste"],
  ["southeast winds", "vientos del sureste"],
  ["southwest winds", "vientos del suroeste"],
  ["east winds", "vientos del este"],
  ["west winds", "vientos del oeste"],
  ["north winds", "vientos del norte"],
  ["south winds", "vientos del sur"],
  ["northeast", "noreste"],
  ["northwest", "noroeste"],
  ["southeast", "sureste"],
  ["southwest", "suroeste"],
  ["east", "este"],
  ["west", "oeste"],
  ["north", "norte"],
  ["south", "sur"],
  ["winds", "vientos"],
  ["areas of dense fog", "áreas de niebla densa"],
  ["areas of fog", "áreas de niebla"],
  ["patchy fog", "niebla dispersa"],
  ["fog", "niebla"],
  ["percent", "por ciento"],
  ["inches", "pulgadas"],
  ["inch", "pulgada"],
  [" to ", " a "],
  [" and ", " y "],
  ["then", "luego"],
  // Gender/number agreement for composed phrases (MVP single-form tables
  // above default to masculine singular; these correct the common
  // feminine/plural nouns). Runs last so it fixes composed output.
  ["numeroso tormentas", "numerosas tormentas"],
  ["disperso tormentas", "dispersas tormentas"],
  ["aislado tormentas", "aisladas tormentas"],
  ["intenso tormentas", "intensas tormentas"],
  ["numeroso chubascos", "numerosos chubascos"],
  ["disperso chubascos", "dispersos chubascos"],
  ["aislado chubascos", "aislados chubascos"],
  ["intenso lluvia", "intensa lluvia"],
  ["intenso llovizna", "intensa llovizna"],
  ["intenso nieve", "intensa nieve"],
];

const FR_EXPRESSIONS: Pair[] = [
  ["mostly sunny", "généralement ensoleillé"],
  ["mostly clear", "généralement dégagé"],
  ["mostly cloudy", "généralement nuageux"],
  ["partly cloudy", "partiellement nuageux"],
  ["sunny", "ensoleillé"],
  ["clear", "dégagé"],
  ["cloudy", "nuageux"],
  ["snow accumulation of", "accumulation de neige de"],
  ["possible ", "possible "],
  ["around an inch", "environ un pouce"],
  ["around 2 cm", "environ 2 cm"],
  ["little or no accumulation", "peu ou pas d'accumulation"],
  ["more than 2 feet", "plus de 2 pieds"],
  ["more than 40 cm", "plus de 40 cm"],
  ["probability of precipitation", "probabilité de précipitations"],
  ["slight chance of", "faible risque de"],
  ["chance of", "risque de"],
  ["heavy", "abondant"],
  ["freezing rain", "pluie verglaçante"],
  ["freezing drizzle", "bruine verglaçante"],
  ["patchy drizzle", "bruine éparse"],
  ["drizzle", "bruine"],
  ["thunderstorms", "orages"],
  ["rain showers", "averses de pluie"],
  ["showers", "averses"],
  ["rain", "pluie"],
  ["snow", "neige"],
  ["isolated", "isolé"],
  ["scattered", "dispersé"],
  ["numerous", "nombreux"],
  ["likely", "probable"],
  ["in the single digits", "à un seul chiffre"],
  ["in the lower", "dans les bas"],
  ["in the mid", "dans les moyens"],
  ["in the upper", "dans les hauts"],
  ["in the", "dans les"],
  ["around", "environ"],
  ["highs", "maximums"],
  ["lows", "minimums"],
  ["temperatures rising", "températures en hausse"],
  ["temperatures falling", "températures en baisse"],
  ["light and variable", "vents faibles et variables"],
  ["up to 10 kph", "jusqu'à 10 kph"],
  ["with gusts to", "avec des rafales de"],
  ["northeast winds", "vents du nord-est"],
  ["northwest winds", "vents du nord-ouest"],
  ["southeast winds", "vents du sud-est"],
  ["southwest winds", "vents du sud-ouest"],
  ["east winds", "vents de l'est"],
  ["west winds", "vents de l'ouest"],
  ["north winds", "vents du nord"],
  ["south winds", "vents du sud"],
  ["northeast", "nord-est"],
  ["northwest", "nord-ouest"],
  ["southeast", "sud-est"],
  ["southwest", "sud-ouest"],
  ["east", "est"],
  ["west", "ouest"],
  ["north", "nord"],
  ["south", "sud"],
  ["winds", "vents"],
  ["areas of dense fog", "zones de brouillard dense"],
  ["areas of fog", "zones de brouillard"],
  ["patchy fog", "brouillard épars"],
  ["fog", "brouillard"],
  ["percent", "pour cent"],
  ["inches", "pouces"],
  ["inch", "pouce"],
  [" to ", " à "],
  [" and ", " et "],
  ["then", "puis"],
  // Accord en genre/nombre pour les phrases composées (voir ci-dessus).
  ["dispersé orages", "dispersés orages"],
  ["isolé orages", "isolés orages"],
  ["probable orages", "probables orages"],
  ["abondant orages", "abondants orages"],
  ["nombreux averses", "nombreuses averses"],
  ["dispersé averses", "dispersées averses"],
  ["isolé averses", "isolées averses"],
  ["probable averses", "probables averses"],
  ["abondant averses", "abondantes averses"],
  ["abondant pluie", "abondante pluie"],
  ["abondant bruine", "abondante bruine"],
  ["abondant neige", "abondante neige"],
];

const FR_CLEANUP: Pair[] = [
  ["de à", "d'à"],
  ["du à", "du"],
];

function capitalizeSentences(s: string): string {
  if (!s) return s;
  let out = s[0].toUpperCase() + s.slice(1);
  out = out.replace(/\. ([a-zàâäéèêëîïôöùûüçñ])/g, (_, c: string) => `. ${c.toUpperCase()}`);
  return out;
}

/** Translate an English narrative to es/fr. Unknown locales return input. */
export function translateNarrative(
  english: string,
  locale: SupportedZfpLocale,
): string {
  if (locale === "en") return english;
  const table = locale === "es" ? ES_EXPRESSIONS : FR_EXPRESSIONS;
  let s = english.toLowerCase();
  for (const [en, tr] of table) {
    s = s.split(en).join(tr);
  }
  if (locale === "fr") {
    for (const [a, b] of FR_CLEANUP) {
      s = s.split(a).join(b);
    }
  }
  return capitalizeSentences(s);
}
