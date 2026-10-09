import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./+server.js";

type Event = Parameters<typeof GET>[0];
const event = (qs: string): Event =>
  ({
    url: new URL(`http://localhost/geocode${qs}`),
  }) as unknown as Event;

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

function okFetch(payload: unknown) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /geocode validation", () => {
  it("400s without an address", async () => {
    const res = await GET(event(""));
    expect(res.status).toBe(400);
    expect(await body(res)).toEqual({
      error: "Valid address parameter required (max 200 characters)",
    });
  });

  it("400s on a blank address", async () => {
    const res = await GET(event("?address=%20%20"));
    expect(res.status).toBe(400);
  });

  it("400s past 200 characters without calling upstream", async () => {
    const fetchMock = okFetch({});
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(event(`?address=${"a".repeat(201)}`));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts exactly 200 characters", async () => {
    vi.stubGlobal("fetch", okFetch({ result: { addressMatches: [] } }));
    const res = await GET(event(`?address=${"a".repeat(200)}`));
    expect(res.status).toBe(200);
  });
});

describe("GET /geocode upstream", () => {
  const payload = { result: { addressMatches: [{ x: 1 }] } };

  it("proxies Census JSON with no-store", async () => {
    const fetchMock = okFetch(payload);
    vi.stubGlobal("fetch", fetchMock);
    const res = await GET(event("?address=1600+Pennsylvania+Ave+DC"));
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual(payload);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).toHaveBeenCalledOnce();
    const [upstream] = fetchMock.mock.calls[0];
    expect(String(upstream)).toContain("https://geocoding.geo.census.gov");
    expect(String(upstream)).toContain("1600%20Pennsylvania%20Ave%20DC");
  });

  it("502s on upstream HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad", { status: 500 })),
    );
    const res = await GET(event("?address=x"));
    expect(res.status).toBe(502);
    expect(await body(res)).toEqual({ error: "Upstream error: 500" });
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
    const res = await GET(event("?address=x"));
    expect(res.status).toBe(504);
    expect(await body(res)).toEqual({ error: "Upstream geocoder timeout" });
  });

  it("502s on other fetch failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("dns");
      }),
    );
    const res = await GET(event("?address=x"));
    expect(res.status).toBe(502);
  });
});
