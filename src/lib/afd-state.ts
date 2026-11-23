// Pure decision helpers for the Area Forecast Discussion accordion.
//
// The Weather page loads the AFD from an effect that observes the same state
// `loadAfd` writes. That made a failed request re-arm the effect as soon as
// the loading flag cleared, retrying forever. Keeping the "may this start a
// fetch?" rule here (and unit-testing it) makes that regression hard to
// reintroduce.

export interface AfdLoadStatus {
  /** Office whose product is currently loaded. */
  fetchedOffice: string | null;
  /** Office with an in-flight request, if any. */
  loadingOffice: string | null;
  /** Office whose last automatic attempt failed. */
  failedOffice: string | null;
  /** Whether a product is actually held in state. */
  hasProduct: boolean;
}

/**
 * True when opening the panel should start a fetch for `officeId`.
 * A failed office waits for the explicit "Try again" button (which calls
 * `loadAfd` directly) so the loading-flag reset cannot trigger a retry loop.
 */
export function shouldAutoLoadAfd(
  status: AfdLoadStatus,
  officeId: string | null,
  isOpen: boolean,
): boolean {
  if (!isOpen || !officeId) return false;
  if (status.fetchedOffice === officeId && status.hasProduct) return false;
  if (status.loadingOffice === officeId) return false;
  if (status.failedOffice === officeId) return false;
  return true;
}
