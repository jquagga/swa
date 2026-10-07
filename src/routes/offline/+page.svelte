<script lang="ts">
  import { goto } from "$app/navigation";
</script>

<div class="container swa-offline-hero">
  <h1>You're offline</h1>
  <p>
    Simple Weather needs a connection to fetch fresh forecasts, but your last
    viewed forecast may still be available from the Weather page cache.
  </p>
  <button onclick={() => goto("/")}>Back home</button>
</div>
