<script lang="ts">
  import { goto } from "$app/navigation";

  let geolocationError = $state<string | null>(null);
  let isGeolocating = $state(false);
  let address = $state("");
  let isSearching = $state(false);
  let searchError = $state<string | null>(null);

  function handleGeolocate() {
    geolocationError = null;
    isGeolocating = true;

    const options = {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 3600,
    };

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      geolocationError = "Geolocation is not supported in this environment.";
      isGeolocating = false;
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const latitude = Math.round(pos.coords.latitude * 10000) / 10000;
        const longitude = Math.round(pos.coords.longitude * 10000) / 10000;
        await goto(`/Weather?lat=${latitude}&lon=${longitude}`);
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
      options
    );
  }

  async function handleAddressSearch() {
    searchError = null;
    isSearching = true;

    if (!address.trim()) {
      searchError = "Please enter an address to search.";
      isSearching = false;
      return;
    }

    try {
      const encodedAddress = encodeURIComponent(address.trim());
      const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodedAddress}&benchmark=4&format=json`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Check if we have a valid result with coordinates
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
          // Census API returns x as longitude and y as latitude
          const longitude = Math.round(coordinates.x * 10000) / 10000;
          const latitude = Math.round(coordinates.y * 10000) / 10000;
          goto(`/Weather?lat=${latitude}&lon=${longitude}`);
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
      Simple Weather App queries the US National Weather Service to provide a
      responsive weather forecast. Pressing the button below will ask for
      location permission, and provide your forecast if you're in the United
      States.
    </p>
    <div style="text-align: center;">
      {#if geolocationError}
        <p style="color: red;">{geolocationError}</p>
      {/if}
      <button
        onclick={handleGeolocate}
        disabled={isGeolocating}
        style="text-align: center;"
      >
        {isGeolocating ? "Geolocating..." : "Geolocate"}
      </button>
    </div>
    <br />
    <br />
    <h2 style="text-align: center;">OR:</h2>
    <p>
      Alternatively, you can utilize the Census Bureau geocoding search and this
      will query the forecast for that address.
    </p>
    <input
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
        <p style="color: red;">{searchError}</p>
      {/if}
      <button
        onclick={handleAddressSearch}
        disabled={isSearching}
        class="outline"
      >
        {isSearching ? "Searching..." : "Search"}
      </button>
    </div>
    <br />
    <article>
      Note: A full street address is needed. Searching for Washington, DC will
      not work but searching for 1600 Pennsylvania Ave SE, Washington, DC will.
    </article>
    <!-- And yes, SE is way cooler than NW ;)-->
  </div>
</div>
