<script lang="ts">
  import "#lib/main.css";
  import { onNavigate } from "$app/navigation";
  import { updated } from "$app/state";

  let { children } = $props();
  let swUpdated = $state(false);
  let showUpdate = $derived(swUpdated || updated.current);

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
    <nav class="flex gap-3 text-sm" aria-label="Site">
      <a
        href="https://www.weather.gov/documentation/services-web-api"
        rel="external noopener"
      >
        NWS API
      </a>
      <a href="https://github.com/jquagga/swa" rel="external noopener">GitHub</a>
    </nav>
  </div>
</header>

{@render children()}
