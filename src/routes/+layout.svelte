<script lang="ts">
  import "#lib/main.css";
  import { goto } from "$app/navigation";
  import { onNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { updated } from "$app/state";
  import {
    isEnglishLocale,
    type AppLocale,
    type Provider,
    type Units,
  } from "#lib/preferences.js";
  import {
    initPrefs,
    prefs,
    setLocalePref,
    setProviderPref,
    setUnitsPref,
  } from "#lib/prefs.svelte.js";
  import * as m from "#lib/paraglide/messages.js";
  import { locales as SUPPORTED_LOCALES } from "#lib/paraglide/runtime.js";

  let { children } = $props();
  let swUpdated = $state(false);
  let showUpdate = $derived(swUpdated || updated.current);
  // The installed-but-waiting worker, if one has been observed. `SKIP_WAITING`
  // must be posted here: posting to `controller` targets the *active* (old)
  // worker, whose skipWaiting() is a no-op, so the update would never apply.
  let waitingWorker: ServiceWorker | null = null;

  let prefsReady = $derived(prefs.ready);

  let onGlobal = $derived(page.url.pathname.startsWith("/global"));

  $effect(() => {
    initPrefs();
  });

  async function selectProvider(next: Provider) {
    setProviderPref(next);
    if (next === "openmeteo" && !page.url.pathname.startsWith("/global")) {
      await goto("/global");
    } else if (next === "nws" && page.url.pathname.startsWith("/global")) {
      await goto("/");
    }
  }

  // NWS pages are English-only, so leaving English for a non-English locale
  // carries you to the OpenMeteo workflow that speaks the language —
  // preserving the coordinates when you're on a forecast. English is judged
  // by primary subtag so regional tags (en-US, en-GB) stay on NWS,
  // consistent with defaultProvider(). The locale is applied with
  // Paraglide's reload disabled here because its default full-document
  // reload would race and cancel the navigation below; staying on the same
  // workflow keeps the default reload so translated chrome refreshes.
  // Picking English while global intentionally stays put (use the provider
  // toggle to go back to NWS).
  async function selectLocale(next: AppLocale) {
    const path = page.url.pathname;
    const onNws = path === "/" || path.startsWith("/Weather");
    if (!isEnglishLocale(next) && onNws) {
      setLocalePref(next, { reload: false });
      if (path.startsWith("/Weather")) {
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local, stringified immediately for goto; reactivity not needed
        const params = new URLSearchParams();
        const lat = page.url.searchParams.get("lat");
        const lon = page.url.searchParams.get("lon");
        if (lat) params.set("lat", lat);
        if (lon) params.set("lon", lon);
        await goto(`/global/weather?${params.toString()}`);
      } else {
        await goto("/global");
      }
    } else {
      setLocalePref(next);
    }
  }

  function selectUnits(next: Units) {
    setUnitsPref(next);
  }

  // Use the View Transitions API when the browser supports it.
  onNavigate((navigation) => {
    const doc = document as Document & {
      startViewTransition?: (cb: () => void | Promise<void>) => void;
    };
    if (!doc.startViewTransition) return;
    return new Promise<void>((resolve) => {
      doc.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

  $effect(() => {
    // Workaround for the iOS 26/27 status-bar blur in PWA (standalone)
    // mode: leave 16px of breathing room below the status bar, on top of
    // any notch/Dynamic Island safe area.
    const mq = window.matchMedia("(display-mode: standalone)");
    const isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const apply = () => {
      const standalone =
        mq.matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      document.documentElement.classList.toggle("ios-pwa", isIos && standalone);
    };
    apply();
    mq.addEventListener?.("change", apply);
    return () => {
      mq.removeEventListener?.("change", apply);
    };
  });

  $effect(() => {
    const container = navigator.serviceWorker;
    if (!container) return;

    function onSwMessage(event: MessageEvent) {
      if (event.data?.type === "SW_UPDATED") swUpdated = true;
    }
    container.addEventListener("message", onSwMessage);

    // The service worker no longer calls skipWaiting() on install, so a new
    // worker waits for the user's "Update" click. Surface it as soon as it
    // finishes installing instead of waiting for SvelteKit's version poll.
    let registration: ServiceWorkerRegistration | null = null;
    let watched: ServiceWorker | null = null;

    function onSwStateChange() {
      if (watched?.state === "installed" && container.controller) {
        waitingWorker = watched;
        swUpdated = true;
      }
    }

    function watch(worker: ServiceWorker | null) {
      if (watched) watched.removeEventListener("statechange", onSwStateChange);
      watched = worker;
      watched?.addEventListener("statechange", onSwStateChange);
    }

    function onUpdateFound() {
      watch(registration?.installing ?? null);
    }

    void container
      .getRegistration()
      .then((reg) => {
        if (!reg) return;
        registration = reg;
        registration.addEventListener("updatefound", onUpdateFound);
        if (reg.waiting && container.controller) {
          waitingWorker = reg.waiting;
          swUpdated = true;
        }
        watch(reg.installing);
      })
      .catch(() => {});

    return () => {
      container.removeEventListener("message", onSwMessage);
      registration?.removeEventListener("updatefound", onUpdateFound);
      watch(null);
      waitingWorker = null;
    };
  });

  function reload() {
    // Tell the waiting SW to activate, then reload into the new version once
    // it controls this page (its activate handler clears the old cache).
    const container = navigator.serviceWorker;
    if (!container?.controller) {
      window.location.reload();
      return;
    }
    let reloaded = false;
    const go = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    container.addEventListener("controllerchange", go, { once: true });
    if (waitingWorker) {
      waitingWorker.postMessage({ type: "SKIP_WAITING" });
    } else {
      // SvelteKit can flag a new version before we observe the worker
      // (e.g. right after install). There is nothing useful to post yet, so
      // rely on the timeout below to pick up the update on reload.
      container.controller.postMessage({ type: "SKIP_WAITING" });
    }
    // Fallback when activation never emits a controller change.
    setTimeout(go, 1500);
  }
</script>

{#if showUpdate}
  <div
    role="status"
    class="sticky top-0 z-50 bg-sky-700 px-2 py-2 text-center text-sm text-white"
  >
    A new version is available.
    <button
      class="ml-2 cursor-pointer font-semibold underline underline-offset-2"
      onclick={reload}>Update</button
    >
  </div>
{/if}

<header class="mb-4 border-b border-zinc-200 dark:border-zinc-800">
  <div
    class="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6"
  >
    <a href="/" class="text-lg font-bold no-underline">{m.app_title()}</a>
    <nav class="flex flex-wrap items-center gap-2 text-sm" aria-label="Site">
      {#if prefsReady}
        <div
          class="flex overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700"
          role="group"
          aria-label={m.nav_provider_label()}
        >
          <button
            type="button"
            class="cursor-pointer px-2.5 py-1 text-[0.8rem] font-semibold {!onGlobal
              ? 'bg-brand-700 text-white dark:bg-sky-600'
              : 'text-zinc-600 dark:text-zinc-300'}"
            aria-pressed={!onGlobal}
            onclick={() => void selectProvider("nws")}
          >
            {m.nav_provider_nws()}
          </button>
          <button
            type="button"
            class="cursor-pointer px-2.5 py-1 text-[0.8rem] font-semibold {onGlobal
              ? 'bg-brand-700 text-white dark:bg-sky-600'
              : 'text-zinc-600 dark:text-zinc-300'}"
            aria-pressed={onGlobal}
            onclick={() => void selectProvider("openmeteo")}
          >
            {m.nav_provider_openmeteo()}
          </button>
        </div>
        <label class="flex items-center gap-1 text-[0.8rem]">
          <span class="sr-only">{m.nav_language_label()}</span>
          <select
            class="cursor-pointer rounded-md border border-zinc-200 bg-transparent px-1.5 py-1 text-[0.8rem] dark:border-zinc-700"
            aria-label={m.nav_language_label()}
            value={prefs.locale}
            onchange={(e) =>
              void selectLocale(
                (e.currentTarget as HTMLSelectElement).value as AppLocale,
              )}
          >
            {#each SUPPORTED_LOCALES as l (l)}
              <option value={l}>{l}</option>
            {/each}
          </select>
        </label>
        {#if onGlobal}
          <div
            class="flex overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700"
            role="group"
            aria-label={m.nav_units_label()}
          >
            <button
              type="button"
              class="cursor-pointer px-2 py-1 text-[0.8rem] font-semibold {prefs.units ===
              'metric'
                ? 'bg-brand-700 text-white dark:bg-sky-600'
                : 'text-zinc-600 dark:text-zinc-300'}"
              aria-pressed={prefs.units === "metric"}
              onclick={() => selectUnits("metric")}
            >
              °C
            </button>
            <button
              type="button"
              class="cursor-pointer px-2 py-1 text-[0.8rem] font-semibold {prefs.units ===
              'us'
                ? 'bg-brand-700 text-white dark:bg-sky-600'
                : 'text-zinc-600 dark:text-zinc-300'}"
              aria-pressed={prefs.units === "us"}
              onclick={() => selectUnits("us")}
            >
              °F
            </button>
          </div>
        {/if}
      {/if}
      <a href="https://github.com/jquagga/swa" rel="external noopener">GitHub</a
      >
    </nav>
  </div>
</header>

{@render children()}
