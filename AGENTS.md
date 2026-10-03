# AGENTS.md

SvelteKit 2 + Svelte 5 PWA (client-rendered) deployed to Cloudflare Workers. Queries US NWS weather API. pnpm-only repo.

## Commands

- `pnpm dev` — local dev (`vite dev`)
- `pnpm check` — typecheck (`svelte-kit sync && svelte-check`); only verification available (no test/lint/format scripts)
- `pnpm build` — production build (`vite build`)
- `pnpm preview` — build + `wrangler dev`
- `pnpm deploy` — build + `wrangler deploy`
- `pnpm cf-typegen` — regenerate `src/worker-configuration.d.ts` via `wrangler types`; never hand-edit that file
- Requires pnpm (`preinstall: only-allow pnpm`, `engine-strict=true` in `.npmrc`)

## Architecture

- `src/routes/+page.server.ts` sets `ssr = false; prerender = true` — app is fully client-side. `/Weather/+page.svelte` fetches `api.weather.gov` directly from the browser (points → alerts/forecast/hourly); only US NWS-covered locations work.
- `src/routes/geocode/+server.ts` is a thin proxy to the Census geocoder (`geocoding.geo.census.gov`, 10s timeout) to avoid CORS. Validates `address` (required, ≤200 chars). Keep responses as plain `Response` with `application/json`.
- `src/routes/+page.svelte` rounds coords to 4 decimals before `goto('/Weather?lat=&lon=')`; address search needs a full street address.
- `src/service-worker.js` caches `build`+`files` assets, network-first fallback for the rest. `src/routes/+layout.svelte` only imports `$lib/main.scss` (PicoCSS + `sass-embedded`).
- `vite.config.ts` splits `maplibre-gl` / `chart.js` / `luxon` into manual chunks — keep this when adding large deps. MapLibre worker must load via `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` + `setWorkerUrl` (see `Weather/+page.svelte`).
- Svelte 5 runes (`$state`, `$derived`) throughout; `tsconfig.json` has `checkJs`/`strict` — type new JS accordingly.
- `wrangler.jsonc`: `main: .svelte-kit/cloudflare/_worker.js`, adapter is `@sveltejs/adapter-cloudflare`. Ignore `cf.sh` (stale deploy snippet); use `pnpm deploy`.
- `.github/workflows/` is supply-chain only (dependency-review, scorecard) — no CI tests to update.
