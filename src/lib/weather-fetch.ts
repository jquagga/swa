const USER_AGENT = "https://github.com/jquagga/swa";
const MAX_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
// A `Retry-After` beyond this is treated as "wait too long" and replaced by
// the normal backoff, so a strict upstream never stalls a visible fetch.
const MAX_RETRY_AFTER_MS = 10_000;

/** An HTTP failure that carries the status (and any `Retry-After` hint). */
export class HttpError extends Error {
  readonly status: number;
  readonly retryAfter: string | null;

  constructor(status: number, retryAfter: string | null = null) {
    super(`HTTP error! status: ${status}`);
    this.name = "HttpError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/**
 * Only transient statuses are worth retrying. Other 4xx responses (a bad
 * point, a removed product) will fail identically every time, so retrying
 * them just delays the inevitable error by seconds.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/**
 * Parse a `Retry-After` header (delta-seconds or HTTP date) into ms.
 * Returns null when the header is absent or malformed.
 */
export function parseRetryAfterMs(
  value: string | null,
  nowMs = Date.now(),
): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const dateMs = Date.parse(trimmed);
  if (!Number.isFinite(dateMs)) return null;
  return Math.max(0, dateMs - nowMs);
}

/** Exponential backoff (1s, 2s, …) plus up to 30% jitter. */
export function backoffMs(attempt: number): number {
  const base = 1000 * Math.pow(2, attempt);
  return base + Math.random() * 0.3 * base;
}

function retryDelayMs(error: Error, attempt: number): number {
  if (error instanceof HttpError) {
    const after = parseRetryAfterMs(error.retryAfter);
    if (after != null) return Math.min(after, MAX_RETRY_AFTER_MS);
  }
  return backoffMs(attempt);
}

async function fetchOnce<T>(url: string, headers: HeadersInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new HttpError(response.status, response.headers.get("retry-after"));
    }

    return (await response.json()) as T;
  } finally {
    // Always clear the timeout, including on the error paths — otherwise it
    // stays armed until the 10s window elapses.
    clearTimeout(timeoutId);
  }
}

export async function fetchData<T>(url: string): Promise<T> {
  const headers = {
    accept: "application/geo+json",
    "user-agent": USER_AGENT,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchOnce<T>(url, headers);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (lastError instanceof HttpError) {
        if (!isRetryableStatus(lastError.status)) throw lastError;
      }

      if (attempt === MAX_ATTEMPTS) break;

      const delay = retryDelayMs(lastError, attempt);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error("Unknown error occurred during fetch");
}
