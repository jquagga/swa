import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HttpError,
  fetchData,
  isRetryableStatus,
  parseRetryAfterMs,
} from "./weather-fetch.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchData", () => {
  it("sends the NWS accept header and parses JSON", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        okResponse({ hello: "world" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchData<{ hello: string }>("https://x")).resolves.toEqual({
      hello: "world",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string> | undefined)?.accept).toBe(
      "application/geo+json",
    );
  });

  it("retries once after a transient failure", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(okResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = fetchData<{ ok: boolean }>("https://x");
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws the last error after exhausting retries", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);
    const pending = fetchData("https://x");
    const assertion = expect(pending).rejects.toThrow("down");
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("retry policy", () => {
  it("only retries transient statuses", () => {
    expect(isRetryableStatus(408)).toBe(true);
    expect(isRetryableStatus(425)).toBe(true);
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(404)).toBe(false);
    expect(isRetryableStatus(422)).toBe(false);
  });

  it("parses Retry-After delta-seconds and HTTP dates", () => {
    expect(parseRetryAfterMs("2")).toBe(2000);
    expect(parseRetryAfterMs("0")).toBe(0);
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(parseRetryAfterMs("Thu, 01 Jan 2026 00:00:05 GMT", now)).toBe(5000);
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs("")).toBeNull();
    expect(parseRetryAfterMs("soon")).toBeNull();
  });

  it("does not retry a permanent client error", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchData("https://x")).rejects.toThrow(
      "HTTP error! status: 404",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("retries a server error", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(okResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = fetchData<{ ok: boolean }>("https://x");
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honors a Retry-After longer than the old 10s cap", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response("slow down", {
          status: 429,
          headers: { "retry-after": "30" },
        }),
      )
      .mockResolvedValueOnce(okResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const pending = fetchData<{ ok: boolean }>("https://x");
    await vi.advanceTimersByTimeAsync(29_000);
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("exposes the status on HTTP failures", async () => {
    const fetchMock = vi.fn(async () => new Response("gone", { status: 410 }));
    vi.stubGlobal("fetch", fetchMock);
    const error: unknown = await fetchData("https://x").catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(410);
  });
});
