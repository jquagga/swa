import { describe, expect, it } from "vitest";
import { defaultLocale, defaultProvider, defaultUnits } from "./preferences.js";

describe("defaultProvider", () => {
  it("is NWS only for en-US", () => {
    expect(defaultProvider("en-US")).toBe("nws");
    expect(defaultProvider("en_US")).toBe("nws");
    expect(defaultProvider("  en-US  ")).toBe("nws");
  });

  it("is Open-Meteo for every other locale", () => {
    expect(defaultProvider("en-GB")).toBe("openmeteo");
    expect(defaultProvider("es")).toBe("openmeteo");
    expect(defaultProvider("fr-FR")).toBe("openmeteo");
    expect(defaultProvider("")).toBe("openmeteo");
  });
});

describe("defaultUnits", () => {
  it("is US-customary for any *-US locale", () => {
    expect(defaultUnits("en-US")).toBe("us");
    expect(defaultUnits("es-US")).toBe("us");
    expect(defaultUnits("fr_US")).toBe("us");
  });

  it("is metric otherwise", () => {
    expect(defaultUnits("en-GB")).toBe("metric");
    expect(defaultUnits("es")).toBe("metric");
    expect(defaultUnits("fr-FR")).toBe("metric");
  });
});

describe("defaultLocale", () => {
  it("resolves by primary subtag, defaulting to en", () => {
    expect(defaultLocale("en-US")).toBe("en");
    expect(defaultLocale("es-MX")).toBe("es");
    expect(defaultLocale("es_US")).toBe("es");
    expect(defaultLocale("fr-CA")).toBe("fr");
    expect(defaultLocale("de")).toBe("en");
  });
});
