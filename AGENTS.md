# AGENTS.md

SvelteKit 3 + Svelte 5 PWA (client-rendered) deployed to Cloudflare Workers. Queries US NWS weather API. pnpm-only repo.

## Commands

- `pnpm dev` — local dev (`vite dev`)
- `pnpm check` — typecheck (`svelte-kit sync && svelte-check`); only verification available (no test/lint/format scripts)
- `pnpm build` — production build (`vite build`)
- `pnpm preview` — build + `wrangler dev`
- `pnpm deploy` — build + `wrangler deploy`
- `pnpm cf-typegen` — regenerate `src/worker-configuration.d.ts` via `wrangler types`; never hand-edit that file
- typescript pinned to 6.x — svelte-check 4 rejects TS7 without an experimental dual-install setup; `renovate.json` blocks `>=7`
- Requires pnpm (`preinstall: only-allow pnpm`, `engine-strict=true` in `.npmrc`)

## Architecture

- `src/routes/+page.server.ts` sets `ssr = false; prerender = true` — app is fully client-side. `/Weather/+page.svelte` fetches `api.weather.gov` directly from the browser (points → alerts/forecast/gridpoint); only US NWS-covered locations work.
- `src/routes/geocode/+server.ts` is a thin proxy to the Census geocoder (`geocoding.geo.census.gov`, 10s timeout) to avoid CORS. Validates `address` (required, ≤200 chars). Keep responses as plain `Response` with `application/json`.
- `src/routes/+page.svelte` rounds coords to 4 decimals before `goto('/Weather?lat=&lon=')`; address search needs a full street address.
- `src/service-worker.ts` (typed, excluded from `svelte-check` via `tsconfig.json`) caches `immutable`+`assets` plus the prerendered `/offline` fallback; navigations are network-first with navigation-preload and fall back to `/offline`, other same-origin GETs without query strings are cached (`/geocode` and `?` URLs never cached so forecasts stay fresh). Handles `SKIP_WAITING` messages and broadcasts `SW_UPDATED`. `src/routes/+layout.svelte` imports `#lib/main.css` (Tailwind v4 via `@tailwindcss/vite` + small `@layer base/components` for typography, buttons, cards, inputs, chips, tables; no Pico/Sass toolchain), wires View Transitions, and shows the SW update banner.
- `/Weather/+page.svelte` uses tree-shaken `chart.js` core (no `chart.js/auto`, no `luxon`/`chartjs-adapter-luxon` — dates via `Intl.DateTimeFormat` + category scale), lazy-loads MapLibre via `IntersectionObserver`, caches the last forecast per 4-decimal tile in `localStorage` for offline fallback, and sets/clears the app badge from active alert count. The 24-hour chart is built from raw `/gridpoints` data (`forecastGridData` from `/points`; 7-day text still uses `/forecast`): per-hour slots are expanded from `validTime` intervals with metric→US conversion (°C→°F, km/h→mph); heat-index/wind-chill series render only where NWS provides non-null values.
- `vite.config.ts` relies on SvelteKit route splitting + dynamic `import("maplibre-gl")` (do NOT add `manualChunks`: Vite 8 builds the SW with code-splitting off and rejects it). MapLibre worker must load via `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` + `setWorkerUrl` (see `Weather/+page.svelte`).
- Svelte 5 runes (`$state`, `$derived`) throughout; `tsconfig.json` has `strict` with `checkJs: false` and excludes `src/service-worker.ts`.
- `wrangler.jsonc`: `main: .svelte-kit/cloudflare/_worker.js`, adapter is `@sveltejs/adapter-cloudflare`. Custom asset headers live in root `_headers` (required at project root by the adapter); use `pnpm deploy`. `_headers` must NOT set `Content-Security-Policy` — SvelteKit generates it (per-build bootstrap hashes) from `csp` in `vite.config.ts`.
- `.github/workflows/ci.yml` runs `pnpm check` + `pnpm build`; `dependency-review`/`scorecard` are supply-chain only.
