import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // So really, it's just maplibre that is gianormous and doesn't support tree shaking yet.
          maps: ["maplibre-gl"],
          chart: ["chart.js"],
        },
      },
    },
  },
  plugins: [sveltekit()],
});
