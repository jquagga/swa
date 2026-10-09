import { version } from "$app/env";
import { assets, immutable } from "$app/manifest";
import { resolve } from "$app/paths";

const self = globalThis.self as unknown as ServiceWorkerGlobalScope & {
  __SWA_VERSION?: string;
};

const CACHE = `cache-${version}`;

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
    await self.skipWaiting();
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
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
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

      if (
        response.status === 200 &&
        url.origin === self.location.origin &&
        !url.search
      ) {
        cache.put(event.request, response.clone()).catch(() => {});
      }

      return response;
    } catch (err) {
      const response = await cache.match(event.request);

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
