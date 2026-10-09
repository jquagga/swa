import type { ChartConfiguration, TooltipItem } from "chart.js";
import {
  formatTooltipLabel,
  formatTooltipTitle,
  getPointRadius,
} from "#lib/chart-config.js";
import type { HourPoint } from "#lib/openmeteo.js";

export interface OpenMeteoChartLabels {
  temperature: string;
  feelsLike: string;
  precip: string;
  wind: string;
  humidity: string;
}

const DEFAULT_LABELS: OpenMeteoChartLabels = {
  temperature: "Temperature",
  feelsLike: "Feels like",
  precip: "Chance of Precipitation",
  wind: "Wind",
  humidity: "Humidity",
};

function formatFooter(
  context: TooltipItem<"line">[] | TooltipItem<"bar">[],
  labels: OpenMeteoChartLabels,
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
    if (wind) parts.push(`${labels.wind} ${wind}`);
    if (typeof humidity === "number")
      parts.push(`${labels.humidity} ${humidity}%`);
    return parts.join(" • ");
  } catch {
    return "";
  }
}

/** Chart config for the Open-Meteo 24h view: temp + feels-like + pop bars. */
export function buildOpenMeteoChartConfig(
  hours: HourPoint[],
  formatIso: (iso: string) => string,
  tempUnit: string,
  strings: OpenMeteoChartLabels = DEFAULT_LABELS,
): ChartConfiguration {
  const xLabels = hours.map((h) => h.label);
  const isos = hours.map((h) => h.iso);
  const winds = hours.map((h) => h.wind);
  const humidities = hours.map((h) => h.humidity);
  const pointRadius = getPointRadius(3, xLabels.length);
  const gridColor = "rgba(127, 127, 127, 0.25)";
  return {
    type: "bar" as const,
    data: {
      labels: xLabels,
      datasets: [
        {
          type: "line" as const,
          label: strings.temperature,
          data: hours.map((h) => h.temp),
          borderColor: "#B42318",
          backgroundColor: "rgba(180, 35, 24, 0.08)",
          tension: 0.4,
          yAxisID: "y",
          pointRadius,
          pointHoverRadius: pointRadius + 3,
          pointBackgroundColor: "#B42318",
          pointBorderColor: "#B42318",
          pointBorderWidth: 1,
          borderWidth: 2.5,
          unit: tempUnit,
          isos,
          winds,
          humidities,
        } as never,
        {
          type: "line" as const,
          label: strings.feelsLike,
          data: hours.map((h) => h.feelsLike),
          borderColor: "#C2410C",
          backgroundColor: "transparent",
          borderDash: [6, 4],
          tension: 0.4,
          yAxisID: "y",
          pointRadius,
          pointHoverRadius: pointRadius + 3,
          pointBackgroundColor: "#C2410C",
          pointBorderColor: "#C2410C",
          pointBorderWidth: 1,
          pointStyle: "rectRot",
          borderWidth: 2,
          unit: tempUnit,
          isos,
          winds,
          humidities,
        } as never,
        {
          type: "bar" as const,
          label: strings.precip,
          data: hours.map((h) => h.pop),
          backgroundColor: "rgba(1, 127, 192, 0.45)",
          hoverBackgroundColor: "rgba(1, 127, 192, 0.65)",
          borderColor: "rgba(1, 127, 192, 0.9)",
          borderWidth: 1,
          borderRadius: 3,
          yAxisID: "y1",
          barPercentage: 0.6,
          categoryPercentage: 0.7,
          unit: "%",
          isos,
          winds,
          humidities,
        } as never,
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      interaction: { mode: "index" as const, intersect: false },
      scales: {
        x: {
          type: "category",
          grid: { display: true, color: gridColor },
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
              return `${String(value)}°`;
            },
            padding: 8,
            maxTicksLimit: 6,
          },
          grid: { display: true, color: gridColor },
        },
        y1: {
          type: "linear",
          display: true,
          position: "right" as const,
          min: 0,
          max: 100,
          ticks: {
            callback: function (value: string | number) {
              return `${String(value)}%`;
            },
            maxTicksLimit: 5,
          },
          grid: { display: false },
        },
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom" as const,
          align: "center" as const,
          labels: { usePointStyle: true, padding: 20, boxWidth: 8 },
        },
        tooltip: {
          backgroundColor: "rgba(0, 0, 0, 0.85)",
          titleColor: "#fff",
          bodyColor: "#fff",
          footerColor: "#cbd5e1",
          padding: 12,
          displayColors: true,
          callbacks: {
            title: ((items: never[]) =>
              formatTooltipTitle(items as never, formatIso)) as never,
            label: formatTooltipLabel as never,
            footer: ((items: never[]) =>
              formatFooter(
                items as unknown as
                  TooltipItem<"line">[] | TooltipItem<"bar">[],
                strings,
              )) as never,
          },
        },
      },
      elements: { line: { borderJoinStyle: "round" as const } },
    },
  };
}
