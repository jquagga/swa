<script lang="ts">
  import { goto } from "$app/navigation";
  import { searchCity, type GeocodingResult } from "#lib/openmeteo.js";
  import { resolveInitialProvider } from "#lib/preferences.js";

  $effect(() => {
    // Default routing: en-US stays on the NWS workflow; every other
    // locale (or a stored Global preference) uses /global.
    if (resolveInitialProvider() === "openmeteo") {
      void goto("/global");
    }
  });

  // Use $derived for computed error states
  let geolocationError = $state<string | null>(null);
  let isGeolocating = $state(false);
  let query = $state("");
  let isSearching = $state(false);
  let searchError = $state<string | null>(null);
  let candidates = $state<GeocodingResult[]>([]);
  let geoPermission = $state<string | null>(null);

  // Use $derived for button text
  let geolocateButtonText = $derived(
    isGeolocating ? "Geolocating..." : "Geolocate",
  );
  let searchButtonText = $derived(isSearching ? "Searching..." : "Search");

  // Simple unique IDs for accessibility (not using $props.id() as this is a page component)

  $effect(() => {
    let disposed = false;
    let geoStatus: PermissionStatus | null = null;

    // Probe the Permissions API so we can hint when geolocation is blocked.
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

  async function navigateToWeather(latitude: number, longitude: number) {
    const roundedLat = Math.round(latitude * 10000) / 10000;
    const roundedLon = Math.round(longitude * 10000) / 10000;
    await goto(`/Weather?lat=${roundedLat}&lon=${roundedLon}`);
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
      geolocationError = "Geolocation is not supported in this environment.";
      isGeolocating = false;
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        await navigateToWeather(pos.coords.latitude, pos.coords.longitude);
      },
      (error) => {
        const errorMessages: Record<number, string> = {
          1: "Please enable location access to see your local forecast.",
          2: "Unable to determine your location. Please try again.",
          3: "Location request timed out. Please try again.",
        };

        geolocationError =
          errorMessages[error.code] ||
          "Unable to get your location. Please try again.";
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
      searchError = "Please enter a city to search.";
      return;
    }

    // Cancel any in-flight search so rapid submits don't race.
    searchController?.abort();
    const controller = new AbortController();
    searchController = controller;
    isSearching = true;

    try {
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const results = await searchCity(
        query.trim(),
        "en",
        5,
        controller.signal,
      );
      clearTimeout(timeoutId);

      // A newer submit superseded this one — drop its results.
      if (searchController !== controller) return;

      if (results.length === 0) {
        searchError = "Location not found. Please check and try again.";
      } else {
        candidates = results;
      }
    } catch {
      if (searchController === controller) {
        searchError = "Unable to search for the location. Please try again.";
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
    <p>
      Simple Weather queries the US National Weather Service to provide a
      responsive weather forecast. Use your current location or search for a
      city below. Worldwide forecasts via Open-Meteo are also available — see
      the NWS / OpenMeteo switcher in the top nav bar.
    </p>
    <div class="my-4 grid gap-4 md:grid-cols-2">
      <section class="card" aria-labelledby="geolocate-heading">
        <h2 id="geolocate-heading" class="mt-0 text-lg">Use my location</h2>
        <p class="text-sm">
          Asks for location permission and shows your forecast if you're in the
          United States.
        </p>
        {#if geoPermission === "denied"}
          <p role="note" class="text-sm">
            Location access is blocked in your browser settings — you can still
            search by city.
          </p>
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
        <h2 id="city-heading" class="mt-0 text-lg">Search by city</h2>
        <p class="text-sm">
          Uses the Open-Meteo geocoder. A city or town name is enough. Example:
          Washington, DC.
        </p>
        <form onsubmit={handleCitySearch}>
          <label for="city-input" class="mb-1 block text-sm font-medium"
            >City:</label
          >
          <input
            id="city-input"
            type="search"
            name="city"
            placeholder="Washington, DC"
            aria-label="City"
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
          <p class="meta mt-3">Pick a match to see its NWS forecast:</p>
          <ul class="m-0 mt-2 grid list-none gap-2 p-0">
            {#each candidates as c (c.id)}
              <li class="m-0 list-none">
                <button
                  type="button"
                  class="hover:border-brand-600 block w-full cursor-pointer rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm dark:border-zinc-700"
                  onclick={() =>
                    void navigateToWeather(c.latitude, c.longitude)}
                >
                  <span class="font-semibold">{candidateLabel(c)}</span>
                  <span class="meta block">
                    {c.latitude.toFixed(2)}, {c.longitude.toFixed(2)}
                    {#if c.timezone}
                      • {c.timezone}{/if}
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
