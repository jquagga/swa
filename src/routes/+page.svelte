<script lang="ts">
  import { goto } from "$app/navigation";

  let geolocationError = $state<string | null>(null);
  let isGeolocating = $state(false);

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
      (pos) => {
        const latitude = Math.round(pos.coords.latitude * 10000) / 10000;
        const longitude = Math.round(pos.coords.longitude * 10000) / 10000;
        goto(`/Weather?lat=${latitude}&lon=${longitude}`);
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
</script>

<div class="container">
  <div>
    <h1 style="text-align: center">Simple Weather</h1>
    <p>
      Simple Weather App is a Javascript web app which queries the US National
      Weather Service to provide a responsive weather forecast. Pressing the
      button below will ask for location permission, and provide your forecast
      if you're in the United States.
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
  </div>
</div>
