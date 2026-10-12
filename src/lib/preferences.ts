// App-level preferences: provider, locale, units. Client-persisted in
// localStorage; auto-detect only when no stored value exists.
//
// This module is intentionally pure: it never imports the generated
// Paraglide runtime, so unit tests run on a clean checkout with no
// codegen. Callers pass the supported locale list (and base locale) from
// the generated runtime; matching is exact-tag first, then primary
// subtag ("es-MX" → "es"), then the base locale.

export type Provider = "nws" | "openmeteo";
export type Units = "metric" | "us";
/** Any BCP-47 tag; validated against the supported list where it matters. */
export type AppLocale = string;

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

/** Lowercase primary subtag ("en-US" → "en", "es_MX" → "es"). */
export function primarySubtag(tag: string): string {
  return tag.trim().split(/[-_]/)[0]?.toLowerCase() ?? "";
}

/** English by primary subtag, so regional tags (en-US, en-GB) count. */
export function isEnglishLocale(tag: string): boolean {
  return primarySubtag(tag) === "en";
}

function canonicalSupported(
  tag: string,
  supported: readonly string[],
): string | null {
  const lower = tag.toLowerCase();
  for (const s of supported) {
    if (s.toLowerCase() === lower) return s;
  }
  return null;
}

export function defaultLocale(
  lang: string,
  supported: readonly string[],
  base = "en",
): string {
  const tag = lang.trim().replace(/_/g, "-");
  const exact = canonicalSupported(tag, supported);
  if (exact) return exact;
  const primary = primarySubtag(tag);
  for (const s of supported) {
    if (primarySubtag(s) === primary) return s;
  }
  return base;
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
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
  const v = readStored(PROVIDER_KEY);
  return v === "nws" || v === "openmeteo" ? v : null;
}

/**
 * Stored locale, recognized by membership in the supported list (no shape
 * restriction, so multi-subtag and numeric-region tags survive). Unknown
 * values (e.g. from a newer version) return null and fall through to
 * auto-detect.
 */
export function getStoredLocale(supported: readonly string[]): string | null {
  const v = readStored(LOCALE_KEY);
  if (!v) return null;
  return canonicalSupported(v, supported);
}

export function getStoredUnits(): Units | null {
  const v = readStored(UNITS_KEY);
  return v === "metric" || v === "us" ? v : null;
}

export function resolveInitialProvider(): Provider {
  return getStoredProvider() ?? defaultProvider();
}

export function resolveInitialLocale(
  supported: readonly string[],
  base = "en",
): string {
  return (
    getStoredLocale(supported) ??
    defaultLocale(browserLanguage(), supported, base)
  );
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
