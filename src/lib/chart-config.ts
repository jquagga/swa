import type {
  ChartConfiguration,
  ChartDataset,
  TooltipItem,
} from "chart.js";
import type { ChartData } from "#lib/grid.js";

// ChartDataset plus the custom `unit`/`isos` fields used for tooltips.
// `winds`/`humidities` feed the tooltip footer without extra lookups.
export type UnitLineDataset = ChartDataset<"line", number[]> & {
  unit?: string;
  isos?: string[];
  winds?: string[];
  humidities?: number[];
};

export type UnitBarDataset = ChartDataset<"bar", number[]> & {
  unit?: string;
  isos?: string[];
  winds?: string[];
  humidities?: number[];
};

const DATASET_CONFIG = {
  TEMPERATURE: {
    unit: "°F",
    defaultPointRadius: 3,
  },
  HEAT_INDEX: {
    unit: "°F",
    defaultPointRadius: 3,
  },
  WIND_CHILL: {
    unit: "°F",
    defaultPointRadius: 3,
  },
  PRECIPITATION: {
    unit: "%",
    defaultPointRadius: 2,
  },
} as const;

export function getPointRadius(baseRadius: number, dataLength: number): number {
  if (dataLength > 20) {
    return Math.max(1, baseRadius - 1);
  }
  return baseRadius;
}

export function formatTooltipTitle(
  context: TooltipItem<"line">[] | TooltipItem<"bar">[],
  formatIso: (iso: string) => string,
): string {
  try {
    if (!context || context.length === 0) {
      return "No data available";
    }
    const idx = context[0].dataIndex;
    const iso = (context[0].dataset as unknown as { isos?: string[] }).isos?.[
      idx
    ];
    if (iso) return formatIso(iso);
    if (context[0].label) return formatIso(context[0].label);
    return "Invalid date";
  } catch {
    return context?.[0]?.label ?? "Date error";
  }
}

export function formatTooltipLabel(
  context: TooltipItem<"line"> | TooltipItem<"bar">,
): string {
  try {
    let label = context.dataset.label || "";
    if (label) {
      label += ": ";
    }

    const unit = (context.dataset as { unit?: string }).unit || "";
    label += context.parsed.y + unit;
    return label;
  } catch {
    return "Data error";
  }
}

export function formatTooltipFooter(
  context: TooltipItem<"line">[] | TooltipItem<"bar">[],
): string {
  try {
    if (!context || context.length === 0) return "";
    const idx = context[0].dataIndex;
    const ds = context[0].dataset as unknown as {
      winds?: string[];
      humidities?: number[];
    };
    const wind = ds.winds?.[idx];
    const humidity = ds.humidities?.[idx];
    const parts: string[] = [];
    if (wind) parts.push(`Wind ${wind}`);
    if (typeof humidity === "number") parts.push(`Humidity ${humidity}%`);
    return parts.join(" • ");
  } catch {
    return "";
  }
}

export function buildChartConfig(
  chartData: ChartData,
  formatIso: (iso: string) => string,
): ChartConfiguration {
  const tempPointRadius = getPointRadius(
    DATASET_CONFIG.TEMPERATURE.defaultPointRadius,
    chartData.labels.length,
  );
  const heatPointRadius = getPointRadius(
    DATASET_CONFIG.HEAT_INDEX.defaultPointRadius,
    chartData.labels.length,
  );
  const chillPointRadius = getPointRadius(
    DATASET_CONFIG.WIND_CHILL.defaultPointRadius,
    chartData.labels.length,
  );
  // Neutral grid works in both light and dark mode (previous
  // rgba(0,0,0,0.05) was invisible in dark mode).
  const gridColor = "rgba(127, 127, 127, 0.25)";

  const tempDataset: UnitLineDataset = {
    type: "line" as const,
    label: "Temperature",
    data: chartData.tempValues,
    borderColor: "#B42318",
    backgroundColor: "rgba(180, 35, 24, 0.08)",
    tension: 0.4,
    yAxisID: "y",
    pointRadius: tempPointRadius,
    pointHoverRadius: tempPointRadius + 3,
    pointBackgroundColor: "#B42318",
    pointBorderColor: "#B42318",
    pointBorderWidth: 1,
    borderWidth: 2.5,
    unit: DATASET_CONFIG.TEMPERATURE.unit,
    isos: chartData.isos,
    winds: chartData.windLabels,
    humidities: chartData.humidityValues,
  };
  const feelsDatasets: UnitLineDataset[] = [];
  if (chartData.heatIndexValues.some((v) => v != null)) {
    feelsDatasets.push({
      type: "line" as const,
      label: "Heat Index",
      data: chartData.heatIndexValues as number[],
      borderColor: "#C2410C",
      backgroundColor: "transparent",
      borderDash: [6, 4],
      tension: 0.4,
      yAxisID: "y",
      pointRadius: heatPointRadius,
      pointHoverRadius: heatPointRadius + 3,
      pointBackgroundColor: "#C2410C",
      pointBorderColor: "#C2410C",
      pointBorderWidth: 1,
      pointStyle: "rectRot",
      borderWidth: 2,
      spanGaps: false,
      unit: DATASET_CONFIG.HEAT_INDEX.unit,
      isos: chartData.isos,
      winds: chartData.windLabels,
      humidities: chartData.humidityValues,
    });
  }
  if (chartData.windChillValues.some((v) => v != null)) {
    feelsDatasets.push({
      type: "line" as const,
      label: "Wind Chill",
      data: chartData.windChillValues as number[],
      borderColor: "#017FC0",
      backgroundColor: "transparent",
      borderDash: [6, 4],
      tension: 0.4,
      yAxisID: "y",
      pointRadius: chillPointRadius,
      pointHoverRadius: chillPointRadius + 3,
      pointBackgroundColor: "#017FC0",
      pointBorderColor: "#017FC0",
      pointBorderWidth: 1,
      pointStyle: "rectRot",
      borderWidth: 2,
      spanGaps: false,
      unit: DATASET_CONFIG.WIND_CHILL.unit,
      isos: chartData.isos,
      winds: chartData.windLabels,
      humidities: chartData.humidityValues,
    });
  }
  const popDataset: UnitBarDataset = {
    type: "bar" as const,
    label: "Chance of Precipitation",
    data: chartData.popValues,
    backgroundColor: "rgba(1, 127, 192, 0.45)",
    hoverBackgroundColor: "rgba(1, 127, 192, 0.65)",
    borderColor: "rgba(1, 127, 192, 0.9)",
    borderWidth: 1,
    borderRadius: 3,
    yAxisID: "y1",
    barPercentage: 0.6,
    categoryPercentage: 0.7,
    unit: DATASET_CONFIG.PRECIPITATION.unit,
    isos: chartData.isos,
    winds: chartData.windLabels,
    humidities: chartData.humidityValues,
  };

  return {
    type: "bar" as const,
    data: {
      labels: chartData.labels,
      datasets: [
        tempDataset as never,
        ...(feelsDatasets as never[]),
        popDataset as never,
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 0,
      },
      interaction: {
        mode: "index" as const,
        intersect: false,
      },
      scales: {
        x: {
          type: "category",
          stacked: false,
          grid: {
            display: true,
            color: gridColor,
          },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 9,
            autoSkipPadding: 10,
          },
        },
        y: {
          type: "linear",
          beginAtZero: false,
          grace: "5%",
          ticks: {
            callback: function (value: string | number) {
              return String(value) + "°";
            },
            padding: 8,
            maxTicksLimit: 6,
          },
          grid: {
            display: true,
            color: gridColor,
          },
          title: {
            display: false,
          },
        },
        y1: {
          type: "linear",
          display: true,
          position: "right" as const,
          min: 0,
          max: 100,
          ticks: {
            callback: function (value: string | number) {
              return String(value) + "%";
            },
            maxTicksLimit: 5,
          },
          grid: {
            display: false,
          },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom" as const,
          align: "center" as const,
          labels: {
            usePointStyle: true,
            padding: 20,
            boxWidth: 8,
          },
        },
        tooltip: {
          backgroundColor: "rgba(0, 0, 0, 0.85)",
          titleColor: "#fff",
          bodyColor: "#fff",
          footerColor: "#cbd5e1",
          padding: 12,
          displayColors: true,
          callbacks: {
            title: ((items: TooltipItem<"line">[] | TooltipItem<"bar">[]) =>
              formatTooltipTitle(
                items as TooltipItem<"line">[] | TooltipItem<"bar">[],
                formatIso,
              )) as never,
            label: formatTooltipLabel as never,
            footer: formatTooltipFooter as never,
          },
        },
      },
      elements: {
        line: {
          borderJoinStyle: "round" as const,
        },
      },
    },
  };
}
