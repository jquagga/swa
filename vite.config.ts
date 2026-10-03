import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],

  // Configure Vite for better chunk splitting of large libraries
  // Note: SvelteKit + Vite 8 (Rolldown) ignores manualChunks here and
  // code-splits via the dynamic import()s in Weather/+page.svelte instead.
  // Large deps (maplibre-gl, chart.js, luxon) are lazy-loaded on demand.
  build: {
    rollupOptions: {
      output: {
        // Split large libraries into separate chunks for better caching
        manualChunks: (id) => {
          // MapLibre-GL gets its own chunk (largest library)
          if (id.includes("maplibre-gl")) {
            return "maplibre-gl";
          }
          // Chart.js and its adapter get their own chunk
          if (id.includes("chart.js") || id.includes("chartjs-adapter-luxon")) {
            return "chartjs";
          }
          // Luxon gets its own chunk
          if (id.includes("luxon")) {
            return "luxon";
          }
        },
      },
    },
  },
});
