import { version } from "$app/env";
import { assets, immutable } from "$app/manifest";
import { resolve } from "$app/paths";

const self = globalThis.self as unknown as ServiceWorkerGlobalScope & {
  __SWA_VERSION?: string;
};

const CACHE_PREFIX = "cache-";
const CACHE = `${CACHE_PREFIX}${version}`;
// Remembers the build that was current at the last activation. Activate keeps
// exactly that previous cache so tabs still running the old app can keep
// loading their content-hashed chunks after another tab applies an update.
const META_CACHE = "__swa_meta__";
const META_KEY = "/meta.json";

interface SwMeta {
  current?: string;
}

async function readMeta(): Promise<SwMeta | null> {
  try {
    const cache = await caches.open(META_CACHE);
    const response = await cache.match(META_KEY);
    return response ? ((await response.json()) as SwMeta) : null;
  } catch {
    return null;
  }
}

async function writeMeta(meta: SwMeta): Promise<void> {
  try {
    const cache = await caches.open(META_CACHE);
    await cache.put(
      META_KEY,
      new Response(JSON.stringify(meta), {
        headers: { "content-type": "application/json" },
      }),
    );
  } catch {
    // best-effort
  }
}

// `immutable` (Vite output) and `assets` (static dir) paths are relative to
// the base path, so resolve them to absolute pathnames that can be matched
// against `url.pathname`.
const ASSETS = new Set([
  ...immutable.map((entry) => resolve(entry.path)),
  ...assets.map((entry) => resolve(entry.path)),
]);

// Prerendered offline fallback — must exist as a route (see /offline).
const OFFLINE_FALLBACK = "/offline";

async function broadcast(type: string): Promise<void> {
  const clients = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const client of clients) {
    client.postMessage({ type });
  }
}

self.addEventListener("install", (event) => {
  async function addFilesToCache() {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS);
    // Cache the app shell separately: a failure here (e.g. offline
    // first install) must not fail the whole install.
    try {
      await cache.add(OFFLINE_FALLBACK);
    } catch {
      // ignore - navigation fallback will just miss
    }
    // Deliberately do NOT call skipWaiting() here. Activating immediately
    // deletes the previous cache while old pages are still open, so their
    // lazily imported chunks (maplibre-gl, chart.js) would 404. The waiting
    // worker activates when the user accepts the update banner
    // (`SKIP_WAITING` below) or when no old clients remain.
  }

  event.waitUntil(addFilesToCache());
});

self.addEventListener("activate", (event) => {
  async function deleteOldCaches() {
    // Enable navigation preload where supported for faster navigations.
    try {
      if ("navigationPreload" in self.registration) {
        await self.registration.navigationPreload.enable();
      }
    } catch {
      // ignore — progressive enhancement
    }

    // Keep the cache from the build that was current until this activation
    // (plus one older fallback when upgrading from a worker that predates
    // the meta entry). Any other open tab is still on that build and may
    // lazily import chunks this deployment no longer serves; the fetch
    // handler below falls back to these caches.
    const meta = await readMeta();
    const candidates = (await caches.keys()).filter(
      (key) => key.startsWith(CACHE_PREFIX) && key !== CACHE,
    );
    const previous =
      meta?.current && meta.current !== CACHE
        ? meta.current
        : (candidates[0] ?? null);

    for (const key of await caches.keys()) {
      if (key === CACHE || key === META_CACHE || key === previous) continue;
      await caches.delete(key);
    }
    await writeMeta({ current: CACHE });

    await self.clients.claim();
    await broadcast("SW_UPDATED");
  }

  event.waitUntil(deleteOldCaches());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  // ignore POST requests etc
  if (event.request.method !== "GET") return;

  async function respond() {
    const url = new URL(event.request.url);
    const cache = await caches.open(CACHE);

    // `immutable`/`assets` can always be served from the cache
    if (ASSETS.has(url.pathname)) {
      const response = await cache.match(url.pathname);

      if (response) {
        return response;
      }
    }

    // Navigations (e.g. /Weather?lat=&lon=) are network-first, but fall
    // back to the cached offline page when offline so the installed app
    // still opens instead of showing a browser error page.
    // Navigations are never cached: query strings would grow the cache
    // without bound and forecasts must never go stale.
    if (event.request.mode === "navigate") {
      try {
        // Use the preloaded response when navigation preload is enabled.
        const preloaded = await (event as FetchEvent).preloadResponse;
        if (preloaded) return preloaded;
        const response = await fetch(event.request);

        // if we're offline, fetch can return a value that is not a Response
        // instead of throwing - and we can't pass this non-Response to respondWith
        if (!(response instanceof Response)) {
          throw new Error("invalid response from fetch");
        }

        return response;
      } catch (err) {
        const cached =
          (await cache.match(OFFLINE_FALLBACK)) ?? (await cache.match("/"));

        if (cached) {
          return cached;
        }

        throw err;
      }
    }

    // for everything else, try the network first, but
    // fall back to the cache if we're offline.
    // Only cache versioned same-origin GETs without query strings:
    // third-party API/tile responses are left to the network so forecasts
    // and radar never go stale.
    try {
      const response = await fetch(event.request);

      // if we're offline, fetch can return a value that is not a Response
      // instead of throwing - and we can't pass this non-Response to respondWith
      if (!(response instanceof Response)) {
        throw new Error("invalid response from fetch");
      }

      // A client from the previous build can request a content-hashed chunk
      // this deployment no longer serves. Serve the retained previous cache
      // instead of surfacing a 404 into a dynamic import.
      if (
        (response.status === 404 || response.status === 410) &&
        url.origin === self.location.origin
      ) {
        const retained = await caches.match(event.request);
        if (retained) return retained;
      }

      if (
        response.status === 200 &&
        url.origin === self.location.origin &&
        !url.search
      ) {
        cache.put(event.request, response.clone()).catch(() => {});
      }

      return response;
    } catch (err) {
      // Search every retained cache: an old client's chunk lives in the
      // previous build's cache, not the current one.
      const response = await caches.match(event.request);

      if (response) {
        return response;
      }

      // if there's no cache, then just error out
      // as there is nothing we can do to respond to this request
      throw err;
    }
  }

  event.respondWith(respond());
});
