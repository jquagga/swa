import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./+server.js";

type Event = Parameters<typeof GET>[0];
const event = (qs: string): Event =>
  ({
    url: new URL(`http://localhost/reverse${qs}`),
  }) as unknown as Event;

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function nominatim(address: Record<string, string> | undefined) {
  return vi.fn(async () => new Response(JSON.stringify({ address })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /reverse validation", () => {
  it("400s without coordinates", async () => {
    const res = await GET(event(""));
    expect(res.status).toBe(400);
    expect(await body(res)).toEqual({ error: "Valid lat/lon required" });
  });

  it("400s on non-numeric coordinates", async () => {
    expect((await GET(event("?lat=abc&lon=1"))).status).toBe(400);
    expect((await GET(event("?lat=1&lon=xyz"))).status).toBe(400);
  });

  it("400s outside ±90/±180 without calling upstream", async () => {
    const fetchMock = nominatim({});
    vi.stubGlobal("fetch", fetchMock);
    expect((await GET(event("?lat=91&lon=0"))).status).toBe(400);
    expect((await GET(event("?lat=0&lon=181"))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /reverse labeling", () => {
  it("labels city, state, country with no-store", async () => {
    vi.stubGlobal(
      "fetch",
      nominatim({ city: "Austin", state: "Texas", country: "United States" }),
    );
    const res = await GET(event("?lat=30.27&lon=-97.74"));
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({
      label: "Austin, Texas, United States",
    });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("falls back from city to county", async () => {
    vi.stubGlobal(
      "fetch",
      nominatim({
        county: "Rice County",
        state: "Kansas",
        country: "United States",
      }),
    );
    const res = await GET(event("?lat=38.35&lon=-98.2"));
    expect(await body(res)).toEqual({
      label: "Rice County, Kansas, United States",
    });
  });

  it("dedupes a place that repeats its region", async () => {
    vi.stubGlobal(
      "fetch",
      nominatim({
        city: "New York",
        state: "New York",
        country: "United States",
      }),
    );
    const res = await GET(event("?lat=40.71&lon=-74"));
    expect(await body(res)).toEqual({ label: "New York, United States" });
  });

  it("502s when Nominatim has no address", async () => {
    vi.stubGlobal("fetch", nominatim(undefined));
    const res = await GET(event("?lat=0&lon=0"));
    expect(res.status).toBe(502);
    expect(await body(res)).toEqual({ error: "No place found" });
  });

  it("502s on upstream HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad", { status: 500 })),
    );
    const res = await GET(event("?lat=0&lon=0"));
    expect(res.status).toBe(502);
  });

  it("504s on upstream timeouts", async () => {
    const err = new Error("timed out");
    err.name = "TimeoutError";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw err;
      }),
    );
    const res = await GET(event("?lat=0&lon=0"));
    expect(res.status).toBe(504);
  });
});
