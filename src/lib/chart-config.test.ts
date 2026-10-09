import { describe, expect, it } from "vitest";
import type { TooltipItem } from "chart.js";
import {
  buildChartConfig,
  formatTooltipFooter,
  formatTooltipLabel,
  formatTooltipTitle,
  getPointRadius,
} from "./chart-config.js";
import type { ChartData } from "./grid.js";

function chartData(overrides: Partial<ChartData> = {}): ChartData {
  return {
    labels: ["7 PM", "8 PM"],
    isos: ["2026-01-01T00:00:00.000Z", "2026-01-01T01:00:00.000Z"],
    tempValues: [68, 66],
    heatIndexValues: [null, null],
    windChillValues: [null, null],
    popValues: [10, 20],
    windLabels: ["6 mph", "5 mph"],
    humidityValues: [55, 60],
    ...overrides,
  };
}

describe("getPointRadius", () => {
  it("shrinks points on crowded charts", () => {
    expect(getPointRadius(3, 10)).toBe(3);
    expect(getPointRadius(3, 20)).toBe(3);
    expect(getPointRadius(3, 21)).toBe(2);
    expect(getPointRadius(3, 200)).toBe(2);
  });
});

describe("tooltip formatters", () => {
  it("labels values with their dataset unit", () => {
    const context = {
      dataset: { label: "Temperature", unit: "°F" },
      parsed: { y: 68 },
    } as unknown as TooltipItem<"line">;
    expect(formatTooltipLabel(context)).toBe("Temperature: 68°F");
  });

  it("builds wind/humidity footers, empty when bare", () => {
    const context = [
      {
        dataIndex: 0,
        dataset: { winds: ["6 mph"], humidities: [55] },
      },
    ] as unknown as TooltipItem<"line">[];
    expect(formatTooltipFooter(context)).toBe("Wind 6 mph • Humidity 55%");
    expect(formatTooltipFooter([])).toBe("");
  });

  it("titles tooltips from dataset isos via formatIso", () => {
    const context = [
      {
        dataIndex: 1,
        label: "8 PM",
        dataset: { isos: ["iso-0", "iso-1"] },
      },
    ] as unknown as TooltipItem<"line">[];
    expect(formatTooltipTitle(context, (iso) => `fmt:${iso}`)).toBe(
      "fmt:iso-1",
    );
    expect(formatTooltipTitle([], (iso) => iso)).toBe("No data available");
  });
});

describe("buildChartConfig", () => {
  it("emits temp + PoP datasets, adding feels-like lines only when present", () => {
    const base = buildChartConfig(chartData(), (iso) => iso);
    expect(base.data.labels).toEqual(["7 PM", "8 PM"]);
    expect(base.data.datasets.map((d) => d.label)).toEqual([
      "Temperature",
      "Chance of Precipitation",
    ]);

    const feels = buildChartConfig(
      chartData({ heatIndexValues: [70, 69], windChillValues: [60, 59] }),
      (iso) => iso,
    );
    expect(feels.data.datasets.map((d) => d.label)).toEqual([
      "Temperature",
      "Heat Index",
      "Wind Chill",
      "Chance of Precipitation",
    ]);
  });
});
