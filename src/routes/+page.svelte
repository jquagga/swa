<script lang="ts">
  import { goto } from "$app/navigation";

  // Use $derived for computed error states
  let geolocationError = $state<string | null>(null);
  let isGeolocating = $state(false);
  let address = $state("");
  let isSearching = $state(false);
  let searchError = $state<string | null>(null);
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

  async function handleAddressSearch(event?: SubmitEvent) {
    event?.preventDefault();
    searchError = null;

    if (!address.trim()) {
      searchError = "Please enter an address to search.";
      return;
    }

    // Cancel any in-flight search so rapid submits don't race.
    searchController?.abort();
    const controller = new AbortController();
    searchController = controller;
    isSearching = true;

    try {
      const url = `/geocode?address=${encodeURIComponent(address.trim())}`;

      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: {
        result?: {
          addressMatches?: Array<{
            coordinates?: { x?: number; y?: number };
          }>;
        };
      } = await response.json();

      if (
        data.result &&
        data.result.addressMatches &&
        data.result.addressMatches.length > 0
      ) {
        const match = data.result.addressMatches[0];
        const coordinates = match.coordinates;

        if (
          coordinates &&
          coordinates.x !== undefined &&
          coordinates.y !== undefined
        ) {
          await navigateToWeather(coordinates.y, coordinates.x);
        } else {
          searchError = "No coordinates found for the provided address.";
        }
      } else {
        searchError =
          "Address not found. Please check the address and try again.";
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        // Superseded by a newer submit, or timed out. Only report timeouts
        // for the still-active request.
        if (searchController === controller) {
          searchError = "Unable to geocode the address. Please try again.";
        }
        return;
      }
      console.error("Error geocoding address:", error);
      searchError = "Unable to geocode the address. Please try again.";
    } finally {
      if (searchController === controller) {
        isSearching = false;
        searchController = null;
      }
    }
  }
</script>

<div class="shell">
  <div>
    <p>
      Simple Weather queries the US National Weather Service to provide a
      responsive weather forecast. Use your current location or a full US street
      address below.
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
            search by address.
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
      <section class="card" aria-labelledby="address-heading">
        <h2 id="address-heading" class="mt-0 text-lg">Search by address</h2>
        <p class="text-sm">
          Uses the Census Bureau geocoder. <strong>
            A full street address is needed.
          </strong>
          Example: 1600 Pennsylvania Ave SE, Washington, DC.
        </p>
        <form onsubmit={handleAddressSearch}>
          <label for="address-input" class="mb-1 block text-sm font-medium"
            >Street Address:</label
          >
          <input
            id="address-input"
            type="search"
            name="address"
            placeholder="1600 Pennsylvania Ave SE, Washington, DC"
            aria-label="Street Address"
            class="input"
            bind:value={address}
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
      </section>
    </div>
  </div>
</div>
