import adapter from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
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
            "https://mapservices.weather.noaa.gov"
          ],
          "connect-src": [
            "self",
            "https://api.weather.gov",
            "https://tiles.openfreemap.org",
            "https://mapservices.weather.noaa.gov",
            "https://geocoding.geo.census.gov"
          ],
          // 'unsafe-inline' covers style *attributes* (used throughout the
          // markup); SvelteKit hashes Svelte-generated inline <style> itself.
          "style-src": ["self", "unsafe-inline", "https://tiles.openfreemap.org"],
          "font-src": ["self", "data:"],
          "script-src": ["self", "wasm-unsafe-eval"],
          "worker-src": ["self", "blob:"],
          "manifest-src": ["self"]
        }
      }
    })
  ],
  build: {
    // SvelteKit already code-splits per route; maplibre-gl stays behind a
    // dynamic import (IntersectionObserver-gated) so it never blocks first
    // paint. manualChunks is intentionally unset: Vite 8 builds the service
    // worker with codeSplitting disabled and rejects it there.
    chunkSizeWarningLimit: 1100
  }
});
