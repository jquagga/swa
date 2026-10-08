// WMO weather-code (WW) classification for Open-Meteo hourly data.
// Amount-based samplers can't see thunderstorms, fog, or freezing-vs-liquid
// distinctions, so periods carry these fractions alongside the amounts.
// Code table: https://open-meteo.com/en/docs (0 clear … 99 heavy hail).

export interface WmoSummary {
  thunderFrac: number;
  fogFrac: number;
  /** 48 depositing rime fog (dense) subset */
  denseFogFrac: number;
  freezingRainFrac: number;
  freezingDrizzleFrac: number;
  drizzleFrac: number;
  rainFrac: number;
  showerFrac: number;
  snowFrac: number;
  /** 55/65/67/75/82/97/99 heavy-variant subset */
  heavyFrac: number;
  /** Any precipitation-type code (excludes fog/clear/cloud) */
  precipFrac: number;
}

const THUNDER = new Set([95, 96, 97, 99]);
const FOG = new Set([45, 48]);
const FREEZING_RAIN = new Set([66, 67]);
const FREEZING_DRIZZLE = new Set([56, 57]);
const DRIZZLE = new Set([51, 53, 55]);
const RAIN = new Set([61, 63, 65]);
const SHOWERS = new Set([80, 81, 82]);
const SNOW = new Set([71, 73, 75, 77, 85, 86]);
const HEAVY = new Set([55, 57, 65, 67, 75, 82, 97, 99]);

const EMPTY: WmoSummary = {
  thunderFrac: 0,
  fogFrac: 0,
  denseFogFrac: 0,
  freezingRainFrac: 0,
  freezingDrizzleFrac: 0,
  drizzleFrac: 0,
  rainFrac: 0,
  showerFrac: 0,
  snowFrac: 0,
  heavyFrac: 0,
  precipFrac: 0,
};

export function summarizeWmo(
  codes: (number | null)[],
  totalHours: number,
): WmoSummary {
  if (!totalHours) return { ...EMPTY };
  let thunder = 0;
  let fog = 0;
  let denseFog = 0;
  let fr = 0;
  let fz = 0;
  let dz = 0;
  let rain = 0;
  let showers = 0;
  let snow = 0;
  let heavy = 0;
  let precip = 0;
  for (const raw of codes) {
    if (raw == null || !Number.isFinite(raw)) continue;
    const c = Math.round(raw);
    let isPrecip = false;
    if (THUNDER.has(c)) {
      thunder++;
      isPrecip = true;
    }
    if (FOG.has(c)) {
      fog++;
      if (c === 48) denseFog++;
    }
    if (FREEZING_RAIN.has(c)) {
      fr++;
      isPrecip = true;
    }
    if (FREEZING_DRIZZLE.has(c)) {
      fz++;
      isPrecip = true;
    }
    if (DRIZZLE.has(c)) {
      dz++;
      isPrecip = true;
    }
    if (RAIN.has(c)) {
      rain++;
      isPrecip = true;
    }
    if (SHOWERS.has(c)) {
      showers++;
      isPrecip = true;
    }
    if (SNOW.has(c)) {
      snow++;
      isPrecip = true;
    }
    if (HEAVY.has(c)) heavy++;
    if (isPrecip) precip++;
  }
  const f = (n: number): number => n / totalHours;
  return {
    thunderFrac: f(thunder),
    fogFrac: f(fog),
    denseFogFrac: f(denseFog),
    freezingRainFrac: f(fr),
    freezingDrizzleFrac: f(fz),
    drizzleFrac: f(dz),
    rainFrac: f(rain),
    showerFrac: f(showers),
    snowFrac: f(snow),
    heavyFrac: f(heavy),
    precipFrac: f(precip),
  };
}
