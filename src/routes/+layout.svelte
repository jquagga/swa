<script lang="ts">
  import "#lib/main.css";
  import { goto } from "$app/navigation";
  import { onNavigate } from "$app/navigation";
  import { page } from "$app/state";
  import { updated } from "$app/state";
  import { SUPPORTED_LOCALES, type AppLocale, type Provider, type Units } from "#lib/preferences.js";
  import { initPrefs, prefs, setLocalePref, setProviderPref, setUnitsPref } from "#lib/prefs.svelte.js";

  let { children } = $props();
  let swUpdated = $state(false);
  let showUpdate = $derived(swUpdated || updated.current);

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

  function selectLocale(next: AppLocale) {
    setLocalePref(next);
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
      document.documentElement.classList.toggle(
        "ios-pwa",
        isIos && standalone,
      );
    };
    apply();
    mq.addEventListener?.("change", apply);
    return () => {
      mq.removeEventListener?.("change", apply);
    };
  });

  $effect(() => {
    function onSwMessage(event: MessageEvent) {
      if (event.data?.type === "SW_UPDATED") swUpdated = true;
    }
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
    };
  });

  function reload() {
    // Tell the waiting SW to activate, then reload into the new version.
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: "SKIP_WAITING" });
    }
    setTimeout(() => window.location.reload(), 300);
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
    <a href="/" class="text-lg font-bold no-underline">Simple Weather</a>
    <nav class="flex flex-wrap items-center gap-2 text-sm" aria-label="Site">
      {#if prefsReady}
        <div
          class="flex overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700"
          role="group"
          aria-label="Forecast source"
        >
          <button
            type="button"
            class="cursor-pointer px-2.5 py-1 text-[0.8rem] font-semibold {!onGlobal
              ? 'bg-brand-700 text-white dark:bg-sky-600'
              : 'text-zinc-600 dark:text-zinc-300'}"
            aria-pressed={!onGlobal}
            onclick={() => void selectProvider("nws")}
          >
            NWS
          </button>
          <button
            type="button"
            class="cursor-pointer px-2.5 py-1 text-[0.8rem] font-semibold {onGlobal
              ? 'bg-brand-700 text-white dark:bg-sky-600'
              : 'text-zinc-600 dark:text-zinc-300'}"
            aria-pressed={onGlobal}
            onclick={() => void selectProvider("openmeteo")}
          >
            OpenMeteo
          </button>
        </div>
        <label class="flex items-center gap-1 text-[0.8rem]">
          <span class="sr-only">Language</span>
          <select
            class="cursor-pointer rounded-md border border-zinc-200 bg-transparent px-1.5 py-1 text-[0.8rem] dark:border-zinc-700"
            aria-label="Language"
            value={prefs.locale}
            onchange={(e) =>
              selectLocale((e.currentTarget as HTMLSelectElement).value as AppLocale)}
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
            aria-label="Units"
          >
            <button
              type="button"
              class="cursor-pointer px-2 py-1 text-[0.8rem] font-semibold {prefs.units === 'metric'
                ? 'bg-brand-700 text-white dark:bg-sky-600'
                : 'text-zinc-600 dark:text-zinc-300'}"
              aria-pressed={prefs.units === "metric"}
              onclick={() => selectUnits("metric")}
            >
              °C
            </button>
            <button
              type="button"
              class="cursor-pointer px-2 py-1 text-[0.8rem] font-semibold {prefs.units === 'us'
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
      <a href="https://github.com/jquagga/swa" rel="external noopener">GitHub</a>
    </nav>
  </div>
</header>

{@render children()}
