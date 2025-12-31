import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],

  // Configure Vite for better chunk splitting of large libraries
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
