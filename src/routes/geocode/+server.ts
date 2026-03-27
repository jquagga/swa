import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const address = url.searchParams.get("address");

  if (!address || address.trim().length > 200) {
    return new Response(JSON.stringify({ error: "Valid address parameter required (max 200 characters)" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const encodedAddress = encodeURIComponent(address.trim());
  const geocoderUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodedAddress}&benchmark=4&format=json`;

  try {
    const response = await fetch(geocoderUrl, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        "User-Agent": "https://github.com/jquagga/swa",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Upstream error: ${response.status}` }),
        {
          status: 502,
          headers: { "content-type": "application/json" },
        },
      );
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    if ((error as Error)?.name === "TimeoutError" || (error as Error)?.name === "AbortError") {
      return new Response(JSON.stringify({ error: "Upstream geocoder timeout" }), {
        status: 504,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Geocoder request failed" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
};
