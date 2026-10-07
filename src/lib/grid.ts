// Pure helpers for NWS /gridpoints data: unit conversion, validTime
// interval expansion, and per-hour slot construction for the 24h chart.

export interface GridValueEntry {
  validTime: string;
  value: number | null;
}

export interface GridQuantLayer {
  uom: string;
  values: GridValueEntry[];
}

export interface GridpointProperties {
  temperature?: GridQuantLayer;
  heatIndex?: GridQuantLayer;
  windChill?: GridQuantLayer;
  relativeHumidity?: GridQuantLayer;
  probabilityOfPrecipitation?: GridQuantLayer;
  windSpeed?: GridQuantLayer;
  [key: string]: unknown;
}

export interface GridpointData {
  properties?: GridpointProperties;
}

export type ChartData = {
  labels: string[];
  isos: string[];
  tempValues: number[];
  heatIndexValues: (number | null)[];
  windChillValues: (number | null)[];
  popValues: number[];
  windLabels: string[];
  humidityValues: number[];
};

export interface GridInterval {
  startMs: number;
  endMs: number;
  value: number | null;
}

export const GRAPH_HOURS = 25;

export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

export function convertGridTemperature(
  value: number | null,
  uom: string,
): number | null {
  if (value == null) return null;
  // Gridpoint temps arrive as wmoUnit:degC; pass through if already F.
  if (uom.includes("degF") || uom === "F") return value;
  return celsiusToFahrenheit(value);
}

export function convertGridWindSpeed(
  value: number | null,
  uom: string,
): number | null {
  if (value == null) return null;
  if (uom.includes("km_h") || uom.includes("km/h")) return value * 0.621371;
  if (uom.includes("m_s") || uom.includes("m/s")) return value * 2.23694;
  return value;
}

export function parseIsoDurationMs(duration: string): number | null {
  // Supports the NWS subset: PnD / PTnH / PTnM / PnDTnHnM.
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(duration);
  if (!match) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  if (!days && !hours && !minutes) return null;
  return ((days * 24 + hours) * 60 + minutes) * 60 * 1000;
}

export function parseValidTime(
  validTime: string,
): { startMs: number; endMs: number } | null {
  const parts = validTime.split("/");
  if (parts.length !== 2) return null;
  const startMs = Date.parse(parts[0]);
  if (!Number.isFinite(startMs)) return null;
  let endMs: number;
  if (parts[1].startsWith("P")) {
    const durationMs = parseIsoDurationMs(parts[1]);
    if (durationMs == null) return null;
    endMs = startMs + durationMs;
  } else {
    endMs = Date.parse(parts[1]);
    if (!Number.isFinite(endMs)) return null;
  }
  if (!(endMs > startMs)) return null;
  return { startMs, endMs };
}

export function expandLayerIntervals(
  layer: GridQuantLayer | undefined,
): GridInterval[] {
  if (!layer?.values) return [];
  const intervals: GridInterval[] = [];
  for (const entry of layer.values) {
    const parsed = parseValidTime(entry.validTime);
    if (!parsed) continue;
    intervals.push({ ...parsed, value: entry.value });
  }
  intervals.sort((a, b) => a.startMs - b.startMs);
  return intervals;
}

export function lookupIntervalValue(
  intervals: GridInterval[],
  slotStartMs: number,
): number | null {
  for (const interval of intervals) {
    if (slotStartMs < interval.startMs) break;
    if (slotStartMs < interval.endMs) return interval.value;
  }
  return null;
}

function emptyChartData(): ChartData {
  return {
    labels: [],
    isos: [],
    tempValues: [],
    heatIndexValues: [],
    windChillValues: [],
    popValues: [],
    windLabels: [],
    humidityValues: [],
  };
}

/**
 * Expand step-function gridpoint intervals into hourly slots, skipping past
 * hours. Temperature drives the slot grid; companion layers are looked up
 * per slot.
 */
export function buildHourlyChartData(
  props: GridpointProperties | undefined,
  hourLabelFmt: Intl.DateTimeFormat,
  nowMs = Date.now(),
  maxHours = GRAPH_HOURS,
): ChartData {
  const tempLayer = props?.temperature;
  if (!tempLayer) return emptyChartData();

  const tempIntervals = expandLayerIntervals(tempLayer);
  const heatIntervals = expandLayerIntervals(props?.heatIndex);
  const chillIntervals = expandLayerIntervals(props?.windChill);
  const popIntervals = expandLayerIntervals(props?.probabilityOfPrecipitation);
  const humidityIntervals = expandLayerIntervals(props?.relativeHumidity);
  const windIntervals = expandLayerIntervals(props?.windSpeed);
  const HOUR_MS = 60 * 60 * 1000;

  const labels: string[] = [];
  const isos: string[] = [];
  const tempValues: number[] = [];
  const heatIndexValues: (number | null)[] = [];
  const windChillValues: (number | null)[] = [];
  const popValues: number[] = [];
  const windLabels: string[] = [];
  const humidityValues: number[] = [];

  const tempUom = tempLayer.uom ?? "";
  const heatUom = props?.heatIndex?.uom ?? "";
  const chillUom = props?.windChill?.uom ?? "";
  const windUom = props?.windSpeed?.uom ?? "";

  for (const interval of tempIntervals) {
    for (
      let slotStart = interval.startMs;
      slotStart < interval.endMs && labels.length < maxHours;
      slotStart += HOUR_MS
    ) {
      const slotEnd = slotStart + HOUR_MS;
      if (nowMs >= slotEnd) continue;
      if (interval.value == null) continue;
      const tempF = convertGridTemperature(interval.value, tempUom);
      if (tempF == null) continue;
      const rawHeat = lookupIntervalValue(heatIntervals, slotStart);
      const rawChill = lookupIntervalValue(chillIntervals, slotStart);
      const heatF =
        rawHeat == null ? null : convertGridTemperature(rawHeat, heatUom);
      const chillF =
        rawChill == null ? null : convertGridTemperature(rawChill, chillUom);
      const pop = lookupIntervalValue(popIntervals, slotStart) ?? 0;
      const humidity = lookupIntervalValue(humidityIntervals, slotStart) ?? 0;
      const rawWind = lookupIntervalValue(windIntervals, slotStart);
      const windMph =
        rawWind == null ? null : convertGridWindSpeed(rawWind, windUom);
      const date = new Date(slotStart);
      labels.push(hourLabelFmt.format(date));
      isos.push(date.toISOString());
      tempValues.push(Math.round(tempF));
      heatIndexValues.push(heatF == null ? null : Math.round(heatF));
      windChillValues.push(chillF == null ? null : Math.round(chillF));
      popValues.push(Math.round(pop));
      windLabels.push(windMph == null ? "—" : `${Math.round(windMph)} mph`);
      humidityValues.push(Math.round(humidity));
    }
    if (labels.length >= maxHours) break;
  }

  return {
    labels,
    isos,
    tempValues,
    heatIndexValues,
    windChillValues,
    popValues,
    windLabels,
    humidityValues,
  };
}
