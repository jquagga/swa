import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultLocale,
  defaultProvider,
  defaultUnits,
  getStoredLocale,
  isEnglishLocale,
  resolveInitialLocale,
  setStoredLocale,
} from "./preferences.js";

const SUPPORTED = ["en", "es", "fr"];

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key);
    },
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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
  it("resolves by exact tag then primary subtag, defaulting to base", () => {
    expect(defaultLocale("en-US", ["en", "en-US"], "en")).toBe("en-US");
    expect(defaultLocale("en-US", SUPPORTED, "en")).toBe("en");
    expect(defaultLocale("es-MX", SUPPORTED, "en")).toBe("es");
    expect(defaultLocale("es_US", SUPPORTED, "en")).toBe("es");
    expect(defaultLocale("fr-CA", SUPPORTED, "en")).toBe("fr");
    expect(defaultLocale("de", SUPPORTED, "en")).toBe("en");
  });
});

describe("isEnglishLocale", () => {
  it("counts regional English tags as English", () => {
    expect(isEnglishLocale("en")).toBe(true);
    expect(isEnglishLocale("en-US")).toBe(true);
    expect(isEnglishLocale("en_GB")).toBe(true);
    expect(isEnglishLocale("es")).toBe(false);
    expect(isEnglishLocale("fr-CA")).toBe(false);
  });
});

describe("getStoredLocale", () => {
  it("keeps multi-subtag and numeric-region tags that are supported", () => {
    const supported = ["en", "pt-BR", "es-419", "zh-Hant-HK"];
    for (const tag of supported) {
      setStoredLocale(tag);
      expect(getStoredLocale(supported)).toBe(tag);
    }
  });

  it("canonicalizes casing without losing the selection", () => {
    setStoredLocale("ES-419");
    expect(getStoredLocale(["en", "es-419"])).toBe("es-419");
  });

  it("falls back to null for unsupported tags", () => {
    setStoredLocale("de");
    expect(getStoredLocale(SUPPORTED)).toBeNull();
  });

  it("round-trips through resolveInitialLocale", () => {
    setStoredLocale("es-419");
    expect(resolveInitialLocale(["en", "es-419"], "en")).toBe("es-419");
  });
});
