import type { HourlySeries, PeriodSummary, ZfpPeriod } from "./types.js";
import { summarizeWmo, type WmoSummary } from "./wmo.js";

function avg(vals: (number | null)[]): number | null {
  let s = 0;
  let n = 0;
  for (const v of vals) {
    if (v != null && Number.isFinite(v)) {
      s += v;
      n++;
    }
  }
  return n ? s / n : null;
}

function maxOf(vals: (number | null)[], fallback = 0): number {
  let m = fallback;
  let seen = false;
  for (const v of vals) {
    if (v != null && Number.isFinite(v)) {
      if (!seen || v > m) m = v;
      seen = true;
    }
  }
  return seen ? m : fallback;
}

function sum(vals: (number | null)[]): number {
  let s = 0;
  for (const v of vals) {
    if (v != null && Number.isFinite(v)) s += v;
  }
  return s;
}

function pick(series: (number | null)[], hours: number[]): (number | null)[] {
  return hours.map((h) => series[h] ?? null);
}

/** Local hour (0-23) for an absolute ms in the given IANA zone. */
export function localHour(ms: number, timeZone?: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone,
    }).formatToParts(new Date(ms));
    const h = parts.find((p) => p.type === "hour")?.value;
    const n = h == null ? NaN : Number(h) % 24;
    return Number.isFinite(n) ? n : new Date(ms).getHours();
  } catch {
    return new Date(ms).getHours();
  }
}

function isDayHour(hour: number): boolean {
  return hour >= 6 && hour < 18;
}

/**
 * Slice hourly data into 6am–6pm day / 6pm–6am night periods, capped at
 * 14 periods (7 days). Hours already ended at `nowMs` are skipped so the
 * first period is the one containing now (NWS "This Afternoon"/"Tonight"
 * behavior) — never a past overnight block. Falls back to the full series
 * if everything is past (stale cache).
 */
export function splitDayNight(
  series: HourlySeries,
  maxPeriods = 14,
  nowMs = Date.now(),
): ZfpPeriod[] {
  const HOUR_MS = 60 * 60 * 1000;
  const live = (i: number): boolean => {
    const ms = series.timeMs[i];
    return Number.isFinite(ms) && ms + HOUR_MS > nowMs;
  };
  const build = (skipPast: boolean): ZfpPeriod[] => {
    const periods: ZfpPeriod[] = [];
    let current: number[] | null = null;
    let currentDay: boolean | null = null;
    let startMs = 0;

    for (let i = 0; i < series.timeMs.length; i++) {
      if (skipPast && !live(i)) continue;
      const ms = series.timeMs[i];
      if (!Number.isFinite(ms)) continue;
    const day = isDayHour(localHour(ms, series.timeZone));
    if (current === null || day !== currentDay) {
      if (current !== null && current.length > 0 && currentDay !== null) {
        periods.push({
          index: periods.length,
          isDaytime: currentDay,
          startMs,
          endMs: ms,
          hours: current,
        });
        if (periods.length >= maxPeriods) return periods;
      }
      current = [];
      currentDay = day;
      startMs = ms;
    }
    current.push(i);
  }
  if (current !== null && current.length > 0 && currentDay !== null) {
    const lastMs = series.timeMs[series.timeMs.length - 1] ?? startMs;
    periods.push({
      index: periods.length,
      isDaytime: currentDay,
      startMs,
      endMs: lastMs + 3600_000,
      hours: current,
    });
  }
  return periods.slice(0, maxPeriods);
  };

  const livePeriods = build(true);
  return livePeriods.length > 0 ? livePeriods : build(false);
}

function vectorAvgDir(
  speeds: (number | null)[],
  degs: (number | null)[],
): { dir: number | null; speed: number | null } {
  let x = 0;
  let y = 0;
  let sSum = 0;
  let n = 0;
  for (let i = 0; i < speeds.length; i++) {
    const s = speeds[i];
    const d = degs[i];
    if (s == null || d == null || !Number.isFinite(s) || !Number.isFinite(d)) continue;
    const rad = (d * Math.PI) / 180;
    x += s * Math.sin(rad);
    y += s * Math.cos(rad);
    sSum += s;
    n++;
  }
  if (!n) return { dir: null, speed: null };
  return { dir: (Math.atan2(x, y) * 180) / Math.PI < 0 ? (Math.atan2(x, y) * 180) / Math.PI + 360 : (Math.atan2(x, y) * 180) / Math.PI, speed: sSum / n };
}

export function summarizePeriod(series: HourlySeries, period: ZfpPeriod): PeriodSummary {
  const temps = pick(series.temperatureC, period.hours);
  const tMinC = temps.some((v) => v != null) ? Math.min(...(temps.filter((v) => v != null) as number[])) : null;
  const tMaxC = temps.some((v) => v != null) ? Math.max(...(temps.filter((v) => v != null) as number[])) : null;
  const half = Math.floor(period.hours.length / 2);
  const first = pick(series.temperatureC, period.hours.slice(0, half));
  const second = pick(series.temperatureC, period.hours.slice(half));
  const a = avg(first);
  const b = avg(second);
  const { dir, speed } = vectorAvgDir(
    pick(series.windKph, period.hours),
    pick(series.windDeg, period.hours),
  );
  const gusts = pick(series.windGustKph, period.hours).filter((v) => v != null) as number[];
  const vis = pick(series.visibilityM, period.hours).filter((v) => v != null) as number[];
  return {
    period,
    tMinC,
    tMaxC,
    tAvgC: avg(temps),
    trendC: a != null && b != null ? b - a : null,
    popMax: Math.round(maxOf(pick(series.pop, period.hours))),
    precipSumMm: sum(pick(series.precipMm, period.hours)),
    snowfallSumCm: sum(pick(series.snowfallCm, period.hours)),
    showersSumMm: sum(pick(series.showersMm, period.hours)),
    cloudAvg: avg(pick(series.cloudCover, period.hours)),
    windDirDeg: dir,
    windKph: speed,
    windGustKph: gusts.length ? Math.max(...gusts) : null,
    humidityAvg: avg(pick(series.humidity, period.hours)),
    visibilityMinM: vis.length ? Math.min(...vis) : null,
    wmo: summarizeWmo(
      pick(series.wmoCode ?? [], period.hours),
      period.hours.length,
    ),
  };
}

export function summarizeAll(series: HourlySeries, nowMs = Date.now()): PeriodSummary[] {
  return splitDayNight(series, 14, nowMs).map((p) => summarizePeriod(series, p));
}
