// Pure unit conversions. Samplers always work in metric; these apply
// only when rendering for display.

export function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

export function kphToMph(kph: number): number {
  return kph * 0.621371;
}

export function mmToInches(mm: number): number {
  return mm / 25.4;
}

export function cmToInches(cm: number): number {
  return cm / 2.54;
}

/** Round for display: temps and wind to int, precip smart. */
export function formatTemp(c: number, units: "metric" | "us"): string {
  const v = units === "us" ? celsiusToFahrenheit(c) : c;
  return `${Math.round(v)}°`;
}

export function formatWind(kph: number, units: "metric" | "us"): string {
  const v = units === "us" ? kphToMph(kph) : kph;
  const unit = units === "us" ? "mph" : "kph";
  return `${Math.round(v)} ${unit}`;
}

export function formatPrecip(mm: number, units: "metric" | "us"): string {
  if (units === "us") {
    const inches = mmToInches(mm);
    return `${inches < 10 ? inches.toFixed(2) : inches.toFixed(1)} in`;
  }
  return `${mm < 10 ? mm.toFixed(1) : Math.round(mm)} mm`;
}

export function formatSnow(cm: number, units: "metric" | "us"): string {
  if (units === "us") {
    const inches = cmToInches(cm);
    return `${inches < 10 ? inches.toFixed(1) : Math.round(inches)} in`;
  }
  return `${cm < 10 ? cm.toFixed(1) : Math.round(cm)} cm`;
}
