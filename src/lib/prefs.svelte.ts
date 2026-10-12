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
import { locales, setLocale } from "./paraglide/runtime.js";

export const prefs = $state({
  provider: "nws" as Provider,
  locale: "en" as AppLocale,
  units: "metric" as Units,
  ready: false,
});

let initialized = false;

function applyRuntimeLocale(l: AppLocale, opts?: { reload?: boolean }): void {
  // Only hand tags Paraglide knows to the runtime; anything else stays
  // as an app-level preference with Paraglide on its fallback.
  if ((locales as readonly string[]).includes(l)) {
    setLocale(l as (typeof locales)[number], opts);
  }
}

export function initPrefs(): void {
  if (initialized) return;
  initialized = true;
  prefs.provider = resolveInitialProvider();
  prefs.locale = resolveInitialLocale();
  prefs.units = resolveInitialUnits();
  try {
    // No document reload: the app is fully client-rendered and owns its
    // reactive updates; the locale picker navigates explicitly when the
    // workflow needs to change.
    applyRuntimeLocale(prefs.locale, { reload: false });
  } catch {
    // ignore (prerender)
  }
  prefs.ready = true;
}

export function setProviderPref(p: Provider): void {
  prefs.provider = p;
  setStoredProvider(p);
}

export function setLocalePref(l: AppLocale, opts?: { reload?: boolean }): void {
  prefs.locale = l;
  setStoredLocale(l);
  try {
    applyRuntimeLocale(l, opts);
  } catch {
    // ignore
  }
}

export function setUnitsPref(u: Units): void {
  prefs.units = u;
  setStoredUnits(u);
}
