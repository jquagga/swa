import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchData } from "./weather-fetch.js";

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
