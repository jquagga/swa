// App-level preferences: provider, locale, units. Client-persisted in
// localStorage; auto-detect only when no stored value exists.
//
// Locales are open-ended: the supported list comes from the generated
// Paraglide runtime (i.e. project.inlang/settings.json), so adding a
// language needs no code change here. Matching is exact-tag first, then
// primary-subtag ("es-MX" → "es"), then the base locale.

import { baseLocale, locales } from "#lib/paraglide/runtime.js";

export type Provider = "nws" | "openmeteo";
export type Units = "metric" | "us";
/** Any BCP-47 tag; validated against the supported list where it matters. */
export type AppLocale = string;

export const BASE_LOCALE: string = baseLocale;
export const SUPPORTED_LOCALES: readonly string[] = locales;

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

function canonicalSupported(tag: string): string | null {
  const lower = tag.toLowerCase();
  for (const s of SUPPORTED_LOCALES) {
    if (s.toLowerCase() === lower) return s;
  }
  return null;
}

export function defaultLocale(
  lang = browserLanguage(),
  supported: readonly string[] = SUPPORTED_LOCALES,
): string {
  const tag = lang.trim().replace(/_/g, "-");
  const exact = tag.toLowerCase();
  for (const s of supported) {
    if (s.toLowerCase() === exact) return s;
  }
  const primary = tag.split("-")[0]?.toLowerCase() ?? "";
  for (const s of supported) {
    if (s.split("-")[0]?.toLowerCase() === primary) return s;
  }
  return baseLocale;
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

export function getStoredLocale(): string | null {
  const v = readStored<string>(LOCALE_KEY);
  if (!v) return null;
  // Accept anything shaped like a language tag that we support; unknown
  // values (e.g. from a newer version) fall through to auto-detect.
  return /^[A-Za-z]{2,3}(-[A-Za-z]{2,4})?$/.test(v)
    ? (canonicalSupported(v) ?? null)
    : null;
}

export function getStoredUnits(): Units | null {
  const v = readStored<Units>(UNITS_KEY);
  return v === "metric" || v === "us" ? v : null;
}

export function resolveInitialProvider(): Provider {
  return getStoredProvider() ?? defaultProvider();
}

export function resolveInitialLocale(): string {
  return getStoredLocale() ?? defaultLocale();
}

export function resolveInitialUnits(): Units {
  return getStoredUnits() ?? defaultUnits();
}

export function setStoredProvider(p: Provider): void {
  writeStored(PROVIDER_KEY, p);
}

export function setStoredLocale(l: string): void {
  writeStored(LOCALE_KEY, l);
}

export function setStoredUnits(u: Units): void {
  writeStored(UNITS_KEY, u);
}
