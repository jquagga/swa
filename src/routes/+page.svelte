<script lang="ts">
  import { goto } from "$app/navigation";

  // Use $derived for computed error states
  let geolocationError = $state<string | null>(null);
  let isGeolocating = $state(false);
  let address = $state("");
  let isSearching = $state(false);
  let searchError = $state<string | null>(null);

  // Use $derived for button text
  let geolocateButtonText = $derived(
    isGeolocating ? "Geolocating..." : "Geolocate",
  );
  let searchButtonText = $derived(isSearching ? "Searching..." : "Search");

  // Simple unique IDs for accessibility (not using $props.id() as this is a page component)

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
      maximumAge: 3600,
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

  async function handleAddressSearch() {
    searchError = null;

    if (!address.trim()) {
      searchError = "Please enter an address to search.";
      return;
    }

    isSearching = true;

    try {
      const encodedAddress = encodeURIComponent(address.trim());
      const callbackName = `censusGeocoderCallback_${Date.now()}`;

      // Create a Promise-based JSONP request
      const data = await new Promise<any>((resolve, reject) => {
        // Define the callback function globally
        (window as any)[callbackName] = (response: any) => {
          // Clean up the global callback function
          delete (window as any)[callbackName];

          // Remove the script tag
          const script = document.getElementById(`jsonp-${callbackName}`);
          if (script && script.parentNode) {
            script.parentNode.removeChild(script);
          }

          if (response) {
            resolve(response);
          } else {
            reject(new Error("No response from geocoder"));
          }
        };

        // Create the JSONP URL with callback parameter
        const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodedAddress}&benchmark=4&format=jsonp&callback=${callbackName}`;

        // Create and append the script tag
        const script = document.createElement("script");
        script.id = `jsonp-${callbackName}`;
        script.src = url;
        script.onerror = () => {
          delete (window as any)[callbackName];
          if (script.parentNode) {
            script.parentNode.removeChild(script);
          }
          reject(new Error("Failed to load geocoder script"));
        };

        // Set a timeout for the request
        const timeout = setTimeout(() => {
          delete (window as any)[callbackName];
          if (script.parentNode) {
            script.parentNode.removeChild(script);
          }
          reject(new Error("Geocoder request timed out"));
        }, 15000);

        // Add the script to the document
        document.body.appendChild(script);

        // Clear timeout when the script loads
        script.onload = () => {
          clearTimeout(timeout);
        };
      });

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
        <p style="color: red;">{searchError}</p>
      {/if}
      <button
        onclick={handleAddressSearch}
        disabled={isSearching}
        class="outline"
      >
        {searchButtonText}
      </button>
    </div>
  </div>
</div>
