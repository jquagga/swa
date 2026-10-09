import adapter from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { sveltekit } from "@sveltejs/kit/vite";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/lib/paraglide",
      emitTsDeclarations: true,
      strategy: ["cookie", "localStorage", "baseLocale"],
    }),
    sveltekit({
      // Consult https://svelte.dev/docs/kit/integrations
      // for more information about preprocessors
      preprocess: vitePreprocess(),
      adapter: adapter(),
      // SvelteKit owns the Content-Security-Policy (do NOT also send one
      // from `_headers`: two policies intersect, and a header policy has no
      // hashes for the inline bootstrap script). `hash` mode covers the
      // prerendered pages via `<meta http-equiv>`; the bootstrap script hash
      // changes every build, so it cannot be hardcoded in `_headers`.
      csp: {
        mode: "hash",
        directives: {
          "default-src": ["self"],
          "base-uri": ["self"],
          "object-src": ["none"],
          "frame-ancestors": ["none"],
          "form-action": ["self"],
          "img-src": [
            "self",
            "data:",
            "blob:",
            "https://tiles.openfreemap.org",
            "https://mapservices.weather.noaa.gov",
          ],
          "connect-src": [
            "self",
            "https://api.weather.gov",
            "https://tiles.openfreemap.org",
            "https://mapservices.weather.noaa.gov",
            "https://geocoding.geo.census.gov",
            "https://api.open-meteo.com",
            "https://geocoding-api.open-meteo.com",
          ],
          // No 'unsafe-inline': all app styles live in main.css / Svelte
          // <style> blocks (SvelteKit hashes the latter). JS-set styles
          // via CSSOM (MapLibre/Chart.js) are still allowed by CSP.
          "style-src": ["self", "https://tiles.openfreemap.org"],
          "font-src": ["self", "data:"],
          "script-src": ["self", "wasm-unsafe-eval"],
          "worker-src": ["self", "blob:"],
          "manifest-src": ["self"],
        },
      },
    }),
  ],
  build: {
    // SvelteKit already code-splits per route; maplibre-gl stays behind a
    // dynamic import (IntersectionObserver-gated) so it never blocks first
    // paint. manualChunks is intentionally unset: Vite 8 builds the service
    // worker with codeSplitting disabled and rejects it there.
    chunkSizeWarningLimit: 1100,
  },
});
