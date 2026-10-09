import { describe, expect, it } from "vitest";
import { buildOpenMeteoChartConfig } from "./openmeteo-chart.js";
import type { HourPoint } from "./openmeteo.js";

const HOUR_MS = 3_600_000;
const T0 = Date.UTC(2026, 0, 1, 0);

function hours(): HourPoint[] {
  return [0, 1].map((i) => ({
    timeMs: T0 + i * HOUR_MS,
    label: i === 0 ? "7 PM" : "8 PM",
    iso: new Date(T0 + i * HOUR_MS).toISOString(),
    temp: 68 - i,
    feelsLike: 66 - i,
    pop: 10 + 10 * i,
    wind: `${6 - i} mph`,
    humidity: 55 + 5 * i,
  }));
}

describe("buildOpenMeteoChartConfig", () => {
  it("maps hours to temp + feels-like + PoP datasets", () => {
    const cfg = buildOpenMeteoChartConfig(hours(), (iso) => iso, "°F");
    expect(cfg.data.labels).toEqual(["7 PM", "8 PM"]);
    expect(cfg.data.datasets).toHaveLength(3);
    const [temp, feels, pop] = cfg.data.datasets as unknown as Array<{
      label: string;
      data: number[];
      unit: string;
      isos: string[];
    }>;
    expect(temp.label).toBe("Temperature");
    expect(temp.data).toEqual([68, 67]);
    expect(temp.unit).toBe("°F");
    expect(temp.isos).toHaveLength(2);
    expect(feels.label).toBe("Feels like");
    expect(feels.data).toEqual([66, 65]);
    expect(pop.label).toBe("Chance of Precipitation");
    expect(pop.data).toEqual([10, 20]);
    expect(pop.unit).toBe("%");
  });

  it("uses translated labels for legend and tooltip footer", () => {
    const cfg = buildOpenMeteoChartConfig(hours(), (iso) => iso, "°C", {
      temperature: "Temperatura",
      feelsLike: "Sensación térmica",
      precip: "Probabilidad de lluvia",
      wind: "Viento",
      humidity: "Humedad",
    });
    const [temp, feels, pop] = cfg.data.datasets as unknown as Array<{
      label: string;
    }>;
    expect(temp.label).toBe("Temperatura");
    expect(feels.label).toBe("Sensación térmica");
    expect(pop.label).toBe("Probabilidad de lluvia");
    const footer = (
      cfg.options?.plugins?.tooltip?.callbacks as {
        footer?: (items: never[]) => string;
      }
    ).footer;
    expect(typeof footer).toBe("function");
    const items = [{ dataIndex: 0, dataset: cfg.data.datasets[0] }] as never[];
    expect(footer?.(items)).toBe("Viento 6 mph • Humedad 55%");
  });
});
