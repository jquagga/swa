import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror the `#lib` package-imports alias so tests resolve the same
    // specifiers the app code uses (e.g. `#lib/zfp/index.js`).
    alias: {
      "#lib": new URL("./src/lib", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/routes/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "src/lib/paraglide/**",
        "src/worker-configuration.d.ts",
        "src/service-worker.ts",
      ],
    },
  },
});
