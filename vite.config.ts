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
      adapter: adapter()
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
