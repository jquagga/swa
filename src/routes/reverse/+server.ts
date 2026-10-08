import type { RequestHandler } from "./$types";

// Same-origin proxy for reverse-geocoding GPS coordinates into a place
// name. Upstream is OpenStreetMap Nominatim (keyless, OSM data): it always
// resolves to something sensible (city → county → state fallback), honors
// `accept-language`, and isn't on content-blocker lists. 10s timeout,
// never cached. Usage policy is one request/sec — this endpoint only fires
// on explicit GPS taps. Credit: "Place names © OpenStreetMap contributors"
// (see the /global/weather footer).
export const GET: RequestHandler = async ({ url }) => {
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const language =
    url.searchParams.get("language")?.split(/[-_]/)[0]?.toLowerCase() ?? "en";

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  ) {
    return new Response(JSON.stringify({ error: "Valid lat/lon required" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const upstream =
    `https://nominatim.openstreetmap.org/reverse` +
    `?lat=${lat}&lon=${lon}&format=jsonv2&zoom=10&accept-language=${encodeURIComponent(language)}`;

  try {
    const response = await fetch(upstream, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        // Nominatim usage policy requires a valid Referer or User-Agent.
        "User-Agent": "https://github.com/jquagga/swa",
        Referer: "https://github.com/jquagga/swa",
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

    const data = (await response.json()) as {
      address?: Record<string, string | undefined>;
    };
    const label = buildLabel(data.address);
    if (!label) {
      return new Response(JSON.stringify({ error: "No place found" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ label }), {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (
      (error as Error)?.name === "TimeoutError" ||
      (error as Error)?.name === "AbortError"
    ) {
      return new Response(JSON.stringify({ error: "Upstream timeout" }), {
        status: 504,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "Reverse lookup failed" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
};

/** "New York, United States" / "Rice County, Kansas, United States". */
function buildLabel(
  address: Record<string, string | undefined> | undefined,
): string | null {
  if (!address) return null;
  const place =
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.borough ??
    address.suburb ??
    address.county ??
    address.state;
  const region = address.state ?? address.county;
  const parts = [place, region, address.country].filter(
    (v): v is string => !!v,
  );
  const deduped = parts.filter((v, i) => parts.indexOf(v) === i);
  // A county-level place already implies its state is shown next; drop a
  // region that repeats the place (e.g. city/state both "New York").
  const trimmed =
    deduped.length > 1 && deduped[0] === deduped[1]
      ? [deduped[0], ...deduped.slice(2)]
      : deduped;
  return trimmed.length ? trimmed.join(", ") : null;
}
