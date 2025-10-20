<!--
Guidance for AI coding agents working on the `swa` (Simple Weather App) repository.
Keep instructions short and specific to this codebase. Avoid generic advice.
-->

# Copilot Instructions — Simple Weather App (swa)

This is a SvelteKit progressive web app that queries the U.S. National Weather Service (NWS) API and renders charts and a radar map. Use the guidance below to be productive quickly and avoid breaking runtime behavior.

- Project type: SvelteKit (TypeScript), Cloudflare adapter (see `svelte.config.js`). Build system: Vite. See `package.json` scripts: `dev`, `build`, `preview`, `check`, `check:watch`.
- Key files:
  - `package.json` — scripts and dependencies (Chart.js, maplibre-gl, luxon, Svelte 5)
  - `svelte.config.js` — uses `@sveltejs/adapter-cloudflare`
  - `src/service-worker.js` — app/service worker caching; uses `build`, `files`, and `version` from `$service-worker`
  - `src/routes/Weather/+page.svelte` — main behavior: geolocation, NWS fetches, Chart.js setup, MapLibre map, alert rendering
  - `README.md` — high-level description, demo link, notes about HTTPS and NWS coverage

Important patterns and constraints
- Network calls to NWS: the app sets an explicit `User-Agent` header and `Accept: application/geo+json`. Keep this header when adding or refactoring NWS requests (see `fetchData` in `src/routes/Weather/+page.svelte`). NWS expects a descriptive User-Agent.
- Retries are used for network robustness: `fetchData` wraps fetch in a retry loop (maxRetries = 3). Preserve retry behavior for critical fetches.
- Service worker cache: `src/service-worker.js` creates a deployment-specific cache name `cache-${version}` and pre-caches `...build` and `...files`. Avoid changing these semantics without validating offline behavior.
- Charts and time handling: Chart.js + `chartjs-adapter-luxon` + `luxon` are used. Chart config in `+page.svelte` uses a timeseries x-axis. When modifying chart code keep types and adapter in place.
- Map tiles and radar: MapLibre GL uses OpenFreeMap style URLs and a NOAA WMS tiles endpoint for radar layers. Map is initialized non-interactive (`interactive: false`) — retain unless UI/UX change is intended.

Project-specific conventions
- Small, self-contained pages: the Weather page manages its own data flow (geolocation → point → alerts → forecastHourly → forecast). Follow this local-flow pattern when adding new UI: compute/transform data in the same route component unless it obviously belongs in a reusable `$lib` helper.
- UI classes: PicoCSS is used; the code transforms NWS `severity` to PicoCSS classes (e.g. `pico-background-yellow-100`) in-place on the alert objects. Search/modify `alerts` transformations in `src/routes/Weather/+page.svelte` if touching alert UI.
- Unknown/global helper: `+page.svelte` contains several lines that use an identifier `$state(...)` when initializing locals (for example `let point: any = $state([])`). There is no definition in the repository for `$state`. Do not change or remove `$state(...)` usages without first confirming what runtime/compile macro it maps to (it may be an editor artifact or local plugin). If you must replace it, prefer switching to normal local variables or Svelte stores and run type checks.

Developer workflows (commands to run)
- Local development: npm run dev (starts Vite dev server). Use the browser on `localhost` for live reload.
- Build: npm run build (Vite build). Preview: npm run preview to serve the build locally. Note: service worker + PWA features require a secure context — use `localhost` (treated as secure) or an HTTPS server when testing in other hosts.
- Type-checking: npm run check (runs `svelte-check` with the repo tsconfig). Use this before/after changes to ensure no type errors.

Quality gates for AI edits
- Always run `npm run check` after making changes to TypeScript or Svelte files. If `svelte-check` reports errors, fix them before committing.
- When adding or editing Svelte components, use the Svelte MCP tools if available (see `AGENTS.md` in repo): call the `svelte-autofixer` tool on the component and iterate until no issues are returned.

Small, concrete examples (copy or adapt these patterns)
- Fetch with headers + retry (from `src/routes/Weather/+page.svelte`):

  const headers = { accept: "application/geo+json", "user-agent": "<https://github.com/jquagga/swa>" }
  // fetch loop with maxRetries = 3 — preserve when porting requests.

- Service worker cache naming: `const CACHE =`cache-${version}`` (uses `$service-worker` exports). Use `$service-worker` variables when referring to build/file lists in SW.

When unsure
- If a change touches deployment (Cloudflare adapter) or the service worker, run a full local build and preview and validate offline behavior in the browser.
- If you see `$state(...)` usages, ask a human or search commit history; do not replace blindly.

Where to look next (quick links in the repo)
- `package.json` — scripts & deps
- `src/service-worker.js` — caching & offline strategy
- `src/routes/Weather/+page.svelte` — geolocation, fetch, chart, map and alerts logic
- `README.md` — high-level app purpose and demo link

If anything in these instructions is unclear or you need more examples from specific files, tell me which area to expand (networking, SW, charts, map, or deployment) and I will update this file.
