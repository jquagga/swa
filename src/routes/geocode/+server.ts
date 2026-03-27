import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const address = url.searchParams.get("address");

  if (!address) {
    return new Response(JSON.stringify({ error: "Address parameter required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const encodedAddress = encodeURIComponent(address.trim());
  const geocoderUrl = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodedAddress}&benchmark=4&format=json`;

  try {
    const response = await fetch(geocoderUrl);

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
  } catch {
    return new Response(JSON.stringify({ error: "Geocoder request failed" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
};
