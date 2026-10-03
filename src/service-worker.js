/// <reference types="@sveltejs/kit" />
import { build, files, version } from "$service-worker";

const self = /** @type {ServiceWorkerGlobalScope} */ (
  /** @type {unknown} */ (globalThis.self)
);

const CACHE = `cache-${version}`;

const ASSETS = [...build, ...files];

// Cached app shell used as the offline fallback for navigations.
// The home page is prerendered, so it works without network.
const OFFLINE_FALLBACK = "/";

self.addEventListener("install", (event) => {
  // Create a new cache and add all files to it
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
  // Remove previous cached data from disk
  async function deleteOldCaches() {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  }

  event.waitUntil(deleteOldCaches());
});

self.addEventListener("fetch", (event) => {
  // ignore POST requests etc
  if (event.request.method !== "GET") return;

  async function respond() {
    const url = new URL(event.request.url);
    const cache = await caches.open(CACHE);

    // `build`/`files` can always be served from the cache
    if (ASSETS.includes(url.pathname)) {
      const response = await cache.match(url.pathname);

      if (response) {
        return response;
      }
    }

    // Navigations (e.g. /Weather?lat=&lon=) are network-first, but fall
    // back to the cached app shell when offline so the installed app
    // still opens instead of showing a browser error page.
    // Navigations are never cached: query strings would grow the cache
    // without bound and forecasts must never go stale.
    if (event.request.mode === "navigate") {
      try {
        const response = await fetch(event.request);

        // if we're offline, fetch can return a value that is not a Response
        // instead of throwing - and we can't pass this non-Response to respondWith
        if (!(response instanceof Response)) {
          throw new Error("invalid response from fetch");
        }

        return response;
      } catch (err) {
        const cached =
          (await cache.match(event.request)) ??
          (await cache.match(OFFLINE_FALLBACK));

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
    // and radar never go stale, and /geocode responses are never cached
    // so address lookups always stay fresh.
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
        !url.search &&
        !url.pathname.startsWith("/geocode")
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
