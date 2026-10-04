<script lang="ts">
  import { goto } from "$app/navigation";
</script>

<div class="container" style="text-align: center; padding: 2rem 1rem;">
  <h1>You're offline</h1>
  <p>
    Simple Weather needs a connection to fetch fresh forecasts, but your last
    viewed forecast may still be available from the Weather page cache.
  </p>
  <button onclick={() => goto("/")}>Back home</button>
</div>
