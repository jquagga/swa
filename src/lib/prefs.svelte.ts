// Shared reactive preferences (Svelte 5 runes). Imported by the layout
// and all pages so header toggles update pages in the same tab.
import {
  resolveInitialLocale,
  resolveInitialProvider,
  resolveInitialUnits,
  setStoredLocale,
  setStoredProvider,
  setStoredUnits,
  type AppLocale,
  type Provider,
  type Units,
} from "./preferences.js";
import { setLocale } from "./paraglide/runtime.js";

export const prefs = $state({
  provider: "nws" as Provider,
  locale: "en" as AppLocale,
  units: "metric" as Units,
  ready: false,
});

let initialized = false;

export function initPrefs(): void {
  if (initialized) return;
  initialized = true;
  prefs.provider = resolveInitialProvider();
  prefs.locale = resolveInitialLocale();
  prefs.units = resolveInitialUnits();
  try {
    setLocale(prefs.locale);
  } catch {
    // ignore (prerender)
  }
  prefs.ready = true;
}

export function setProviderPref(p: Provider): void {
  prefs.provider = p;
  setStoredProvider(p);
}

export function setLocalePref(l: AppLocale): void {
  prefs.locale = l;
  setStoredLocale(l);
  try {
    setLocale(l);
  } catch {
    // ignore
  }
}

export function setUnitsPref(u: Units): void {
  prefs.units = u;
  setStoredUnits(u);
}
