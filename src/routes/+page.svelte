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

  async function handleAddressSearch(event?: SubmitEvent) {
    event?.preventDefault();
    searchError = null;

    if (!address.trim()) {
      searchError = "Please enter an address to search.";
      return;
    }

    isSearching = true;

    try {
      const url = `/geocode?address=${encodeURIComponent(address.trim())}`;

      const controller = new AbortController();
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
      console.error("Error geocoding address:", error);
      searchError = "Unable to geocode the address. Please try again.";
    } finally {
      isSearching = false;
    }
  }
</script>

<div class="container">
  <div>
    <h1 style="text-align: center">Simple Weather</h1>
    <p>
      <a href="https://github.com/jquagga/swa">Simple Weather App</a> queries the
      US National Weather Service to provide a responsive weather forecast. Pressing
      the button below will ask for location permission, and provide your forecast
      if you're in the United States.
    </p>
    <div style="text-align: center;">
      {#if geoPermission === "denied"}
        <p role="note">
          Location access is blocked in your browser settings — you can still
          search by address below.
        </p>
      {/if}
      {#if geolocationError}
        <p style="color: red;" role="alert">{geolocationError}</p>
      {/if}
      <button
        onclick={handleGeolocate}
        disabled={isGeolocating}
        style="text-align: center;"
      >
        {geolocateButtonText}
      </button>
    </div>
    <h2 style="text-align: center;">OR:</h2>
    <p>
      Alternatively, you can utilize the Census Bureau geocoding search and this
      will query the forecast for that address. <strong>
        A full street address is needed.
      </strong>
      Searching for Washington, DC will not work but searching for 1600 Pennsylvania
      Ave SE, Washington, DC will.
    </p>
    <form onsubmit={handleAddressSearch}>
      <label for="address-input">Street Address:</label>
      <input
        id="address-input"
        type="search"
        name="address"
        placeholder="Enter Full Street Address:"
        aria-label="Street Address"
        class="container-fluid"
        bind:value={address}
      />
      <br />

      <div style="text-align: center;">
        {#if searchError}
          <p style="color: red;" role="alert">{searchError}</p>
        {/if}
        <button type="submit" disabled={isSearching}>
          {searchButtonText}
        </button>
      </div>
    </form>
  </div>
</div>
