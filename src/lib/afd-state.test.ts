import { describe, expect, it } from "vitest";
import { shouldAutoLoadAfd, type AfdLoadStatus } from "./afd-state.js";

function status(overrides: Partial<AfdLoadStatus> = {}): AfdLoadStatus {
  return {
    fetchedOffice: null,
    loadingOffice: null,
    failedOffice: null,
    hasProduct: false,
    ...overrides,
  };
}

describe("shouldAutoLoadAfd", () => {
  it("loads when the panel is open for an unfetched office", () => {
    expect(shouldAutoLoadAfd(status(), "TOP", true)).toBe(true);
  });

  it("does nothing while the panel is closed or no office is known", () => {
    expect(shouldAutoLoadAfd(status(), "TOP", false)).toBe(false);
    expect(shouldAutoLoadAfd(status(), null, true)).toBe(false);
  });

  it("does not refetch an office whose product is loaded", () => {
    expect(
      shouldAutoLoadAfd(
        status({ fetchedOffice: "TOP", hasProduct: true }),
        "TOP",
        true,
      ),
    ).toBe(false);
  });

  it("does not start a second request while one is in flight", () => {
    expect(
      shouldAutoLoadAfd(status({ loadingOffice: "TOP" }), "TOP", true),
    ).toBe(false);
  });

  it("does not auto-retry a failed office", () => {
    // Regression pin: the effect re-runs when `loadAfd` clears its loading
    // flag after a failure; this must not re-arm an automatic attempt.
    expect(
      shouldAutoLoadAfd(status({ failedOffice: "TOP" }), "TOP", true),
    ).toBe(false);
  });

  it("loads a new office even when a different office failed", () => {
    expect(
      shouldAutoLoadAfd(status({ failedOffice: "TOP" }), "LWX", true),
    ).toBe(true);
  });

  it("retries after the user switches away and back", () => {
    // `clearLocationState`/`loadAfd` reset the failure marker, so a fresh
    // visit to the same office is eligible again.
    expect(shouldAutoLoadAfd(status({ failedOffice: null }), "TOP", true)).toBe(
      true,
    );
  });
});
