<script lang="ts">
  import { goto } from "$app/navigation";
</script>

<div class="shell text-center">
  <h1>You're offline</h1>
  <p class="mx-auto max-w-prose py-8">
    Simple Weather needs a connection to fetch fresh forecasts, but your last
    viewed forecast may still be available from the Weather page cache.
  </p>
  <button class="btn" onclick={() => goto("/")}>Back home</button>
</div>
