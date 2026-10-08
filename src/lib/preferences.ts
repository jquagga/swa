// App-level preferences: provider, locale, units. Client-persisted in
// localStorage; auto-detect only when no stored value exists.

export type Provider = "nws" | "openmeteo";
export type Units = "metric" | "us";
export type AppLocale = "en" | "es" | "fr";

export const SUPPORTED_LOCALES: AppLocale[] = ["en", "es", "fr"];

const PROVIDER_KEY = "swa:provider";
const LOCALE_KEY = "swa:locale";
const UNITS_KEY = "swa:units";

function browserLanguage(): string {
  if (typeof navigator === "undefined") return "en-US";
  return navigator.language || (navigator.languages?.[0] ?? "en-US");
}

/** NWS default only for en-US; every other locale defaults to Open-Meteo. */
export function defaultProvider(lang = browserLanguage()): Provider {
  return /^en[-_]US$/i.test(lang.trim()) ? "nws" : "openmeteo";
}

/** US-customary default for any *-US locale (en-US, es-US, ...). */
export function defaultUnits(lang = browserLanguage()): Units {
  return /[-_]US$/i.test(lang.trim()) ? "us" : "metric";
}

export function defaultLocale(lang = browserLanguage()): AppLocale {
  const primary = lang.trim().split(/[-_]/)[0]?.toLowerCase() ?? "en";
  if (primary === "es") return "es";
  if (primary === "fr") return "fr";
  return "en";
}

function readStored<T extends string>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return (v as T | null) ?? null;
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode — prefs just won't persist
  }
}

export function getStoredProvider(): Provider | null {
  const v = readStored<Provider>(PROVIDER_KEY);
  return v === "nws" || v === "openmeteo" ? v : null;
}

export function getStoredLocale(): AppLocale | null {
  const v = readStored<AppLocale>(LOCALE_KEY);
  return v && (SUPPORTED_LOCALES as string[]).includes(v) ? v : null;
}

export function getStoredUnits(): Units | null {
  const v = readStored<Units>(UNITS_KEY);
  return v === "metric" || v === "us" ? v : null;
}

export function resolveInitialProvider(): Provider {
  return getStoredProvider() ?? defaultProvider();
}

export function resolveInitialLocale(): AppLocale {
  return getStoredLocale() ?? defaultLocale();
}

export function resolveInitialUnits(): Units {
  return getStoredUnits() ?? defaultUnits();
}

export function setStoredProvider(p: Provider): void {
  writeStored(PROVIDER_KEY, p);
}

export function setStoredLocale(l: AppLocale): void {
  writeStored(LOCALE_KEY, l);
}

export function setStoredUnits(u: Units): void {
  writeStored(UNITS_KEY, u);
}
