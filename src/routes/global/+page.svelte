<script lang="ts">
  import { goto } from "$app/navigation";
  import { reverseLabel, searchCity, type GeocodingResult } from "#lib/openmeteo.js";
  import { setStoredProvider } from "#lib/preferences.js";
  import { initPrefs, prefs } from "#lib/prefs.svelte.js";
  import * as m from "#lib/paraglide/messages.js";

  let geolocationError = $state<string | null>(null);
  let isGeolocating = $state(false);
  let query = $state("");
  let isSearching = $state(false);
  let searchError = $state<string | null>(null);
  let candidates = $state<GeocodingResult[]>([]);
  let geoPermission = $state<string | null>(null);

  let geolocateButtonText = $derived(
    isGeolocating ? m.landing_geolocate_button_busy() : m.landing_geolocate_button(),
  );
  let searchButtonText = $derived(
    isSearching ? m.landing_search_button_busy() : m.landing_search_button(),
  );

  $effect(() => {
    initPrefs();
    setStoredProvider("openmeteo");
  });

  $effect(() => {
    let disposed = false;
    let geoStatus: PermissionStatus | null = null;
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((status) => {
          if (disposed) return;
          geoStatus = status;
          geoPermission = status.state;
          status.onchange = () => {
            geoPermission = status.state;
          };
        })
        .catch(() => {});
    }
    return () => {
      disposed = true;
      if (geoStatus) geoStatus.onchange = null;
    };
  });

  async function navigateToWeather(latitude: number, longitude: number, name?: string) {
    const roundedLat = Math.round(latitude * 10000) / 10000;
    const roundedLon = Math.round(longitude * 10000) / 10000;
    const params = new URLSearchParams({
      lat: String(roundedLat),
      lon: String(roundedLon),
    });
    if (name) params.set("name", name);
    await goto(`/global/weather?${params.toString()}`);
  }

  function handleGeolocate() {
    geolocationError = null;
    isGeolocating = true;
    const options = {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 3_600_000,
    };
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      geolocationError = m.error_geolocation_unsupported();
      isGeolocating = false;
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { label } = await reverseLabel(
            pos.coords.latitude,
            pos.coords.longitude,
            prefs.locale,
          );
          await navigateToWeather(pos.coords.latitude, pos.coords.longitude, label);
        } catch {
          await navigateToWeather(pos.coords.latitude, pos.coords.longitude);
        }
      },
      (error) => {
        const errorMessages: Record<number, string> = {
          1: m.error_geolocation_denied(),
          2: m.error_geolocation_unavailable(),
          3: m.error_geolocation_timeout(),
        };
        geolocationError = errorMessages[error.code] || m.error_geolocation_generic();
        isGeolocating = false;
      },
      options,
    );
  }

  let searchController: AbortController | null = null;

  async function handleCitySearch(event?: SubmitEvent) {
    event?.preventDefault();
    searchError = null;
    candidates = [];
    if (!query.trim()) {
      searchError = m.error_address_empty();
      return;
    }
    searchController?.abort();
    const controller = new AbortController();
    searchController = controller;
    isSearching = true;
    try {
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const results = await searchCity(query.trim(), prefs.locale, 5, controller.signal);
      clearTimeout(timeoutId);
      if (searchController !== controller) return;
      if (!results.length) {
        searchError = m.error_address_not_found();
      } else {
        candidates = results;
      }
    } catch {
      if (searchController === controller) {
        searchError = m.error_address_failed();
      }
    } finally {
      if (searchController === controller) {
        isSearching = false;
        searchController = null;
      }
    }
  }

  function candidateLabel(c: GeocodingResult): string {
    return [c.name, c.admin1, c.country].filter(Boolean).join(", ");
  }
</script>

<div class="shell">
  <div>
    <p>{m.landing_intro_global()}</p>
    <div class="my-4 grid gap-4 md:grid-cols-2">
      <section class="card" aria-labelledby="geolocate-heading">
        <h2 id="geolocate-heading" class="mt-0 text-lg">{m.landing_geolocate_title()}</h2>
        <p class="text-sm">{m.landing_geolocate_body_global()}</p>
        {#if geoPermission === "denied"}
          <p role="note" class="text-sm">{m.landing_geolocate_blocked()}</p>
        {/if}
        {#if geolocationError}
          <p class="err" role="alert">{geolocationError}</p>
        {/if}
        <button
          class="btn mt-2"
          onclick={handleGeolocate}
          disabled={isGeolocating}
        >
          {geolocateButtonText}
        </button>
      </section>
      <section class="card" aria-labelledby="city-heading">
        <h2 id="city-heading" class="mt-0 text-lg">{m.landing_search_title_global()}</h2>
        <p class="text-sm">{m.landing_search_body_global()}</p>
        <form onsubmit={handleCitySearch}>
          <label for="city-input" class="mb-1 block text-sm font-medium"
            >{m.landing_search_label_global()}</label
          >
          <input
            id="city-input"
            type="search"
            name="city"
            placeholder={m.landing_search_placeholder_global()}
            aria-label={m.landing_search_label_global()}
            class="input"
            bind:value={query}
          />
          <div class="mt-3">
            {#if searchError}
              <p class="err" role="alert">{searchError}</p>
            {/if}
            <button class="btn mt-2" type="submit" disabled={isSearching}>
              {searchButtonText}
            </button>
          </div>
        </form>
        {#if candidates.length > 0}
          <p class="meta mt-3">{m.landing_search_hint()}</p>
          <ul class="m-0 mt-2 grid list-none gap-2 p-0">
            {#each candidates as c (c.id)}
              <li class="m-0 list-none">
                <button
                  type="button"
                  class="block w-full cursor-pointer rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm hover:border-brand-600 dark:border-zinc-700"
                  onclick={() => void navigateToWeather(c.latitude, c.longitude, candidateLabel(c))}
                >
                  <span class="font-semibold">{candidateLabel(c)}</span>
                  <span class="meta block">
                    {c.latitude.toFixed(2)}, {c.longitude.toFixed(2)}
                    {#if c.timezone} • {c.timezone}{/if}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  </div>
</div>
