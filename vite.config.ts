import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [sveltekit(), cloudflare()],
});
