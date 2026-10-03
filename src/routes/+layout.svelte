<script lang="ts">
  import "$lib/main.scss";
  let { children } = $props();
</script>

<!-- iOS 27 standalone PWA top-blur workaround: a painted fixed strip at the
  very top makes iOS render a solid status bar instead of a large live blur.
  Hidden everywhere except installed iOS PWAs, so other devices are unaffected.
  See https://modernwebweekly.substack.com/p/so-whats-up-with-the-ios27-blur
  and https://tips.ojapp.app/en/ios-27-pwa-top-blur-workaround-2/ -->
<div class="ios27-pwa-status-fix" aria-hidden="true"></div>

{@render children()}

<style>
  .ios27-pwa-status-fix {
    display: none;
  }

  /* Only installed PWAs... */
  @media (display-mode: standalone) {
    /* ...on iOS WebKit only (-webkit-touch-callout is iOS-only). */
    @supports (-webkit-touch-callout: none) {
      .ios27-pwa-status-fix {
        display: block;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        /* Tested threshold is >=6px high and >=80% wide within 4px of top. */
        height: 12px;
        pointer-events: none;
        z-index: 2147483647;
        /* Match the page background so the strip (and status bar sampling
           it) blends in under both Pico light/dark themes. */
        background-color: var(--pico-background-color, #fff);
      }
    }
  }
</style>
