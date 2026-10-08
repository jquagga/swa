import type { Handle } from "@sveltejs/kit/hooks";

// Minimal locale handle: no URL strategy is configured (Paraglide strategy
// is cookie + localStorage + baseLocale) and the app is client-rendered
// (ssr = false), so there is no localized routing or server message
// rendering to do here. This only stamps the prerendered shell's
// %lang%/%dir% placeholders; the client runtime (initPrefs) owns the
// locale afterwards.
//
// Locales are hardcoded (instead of importing the generated Paraglide
// runtime) because plain .ts server modules in this repo cannot resolve
// the generated .js + .d.ts output. Keep in sync with
// project.inlang/settings.json.
const BASE_LOCALE = "en";
const LOCALES = ["en", "es", "fr"];
const COOKIE_NAME = "PARAGLIDE_LOCALE";

function localeFromCookie(cookieHeader: string | null): string {
  if (!cookieHeader) return BASE_LOCALE;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) {
      const value = decodeURIComponent(rest.join("="));
      if (LOCALES.includes(value)) return value;
    }
  }
  return BASE_LOCALE;
}

export const handle: Handle = async ({ event, resolve }) => {
  const locale = localeFromCookie(event.request.headers.get("cookie"));
  return resolve(event, {
    transformPageChunk: ({ html }: { html: string }) =>
      html.replace("%lang%", locale).replace("%dir%", "ltr"),
  });
};
