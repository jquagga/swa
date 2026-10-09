import { describe, expect, it } from "vitest";
import { mapWeatherToEmoji } from "./weather-emoji.js";

describe("mapWeatherToEmoji", () => {
  it("matches case-insensitively", () => {
    expect(mapWeatherToEmoji("SUNNY")).toBe("☀️");
    expect(mapWeatherToEmoji("Sunny")).toBe("☀️");
  });

  it("prefers the more specific phrase over a substring", () => {
    // "Partly Cloudy" contains "cloudy" but must resolve to 🌥️, not ☁️.
    expect(mapWeatherToEmoji("Partly Cloudy")).toBe("🌥️");
    expect(mapWeatherToEmoji("Mostly Sunny")).toBe("🌤️");
  });

  it("matches thunderstorm and winter keywords", () => {
    expect(mapWeatherToEmoji("Thunderstorms")).toBe("⛈️");
    expect(mapWeatherToEmoji("Light Snow")).toBe("❄️");
    expect(mapWeatherToEmoji("Freezing Rain")).toBe("🧊");
  });

  it("prefers hurricane over rain in mixed alerts", () => {
    expect(mapWeatherToEmoji("Hurricane with heavy rain")).toBe("🌀");
  });

  it("returns the input when nothing matches", () => {
    expect(mapWeatherToEmoji("Haze")).toBe("Haze");
  });
});
