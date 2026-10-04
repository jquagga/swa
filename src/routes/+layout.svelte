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
      doc.startViewTransition(() => {
        resolve();
      });
      navigation.complete.catch(() => {});
    });
  });

  $effect(() => {
    function onSwMessage(event: MessageEvent) {
      if (event.data?.type === "SW_UPDATED") swUpdated = true;
    }
    function onBeforeInstall(e: Event) {
      // Stash for the home page install button.
      e.preventDefault();
      (window as any).__pwaPrompt = e;
      window.dispatchEvent(new CustomEvent("pwa:installable"));
    }
    navigator.serviceWorker?.addEventListener("message", onSwMessage);
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onSwMessage);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
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
    style="position: sticky; top: 0; z-index: 50; text-align: center; padding: 0.5rem; background: #017fc0; color: #fff;"
  >
    A new version is available.
    <button onclick={reload} style="margin-left: 0.5rem;">Update</button>
  </div>
{/if}

{@render children()}
