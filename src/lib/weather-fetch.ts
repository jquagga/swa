const USER_AGENT = "https://github.com/jquagga/swa";
const MAX_RETRIES = 3;
const FETCH_TIMEOUT_MS = 10_000;

export async function fetchData<T>(url: string): Promise<T> {
  const headers = {
    accept: "application/geo+json",
    "user-agent": USER_AGENT,
  };

  let retryCount = 0;
  let lastError: Error | null = null;

  while (retryCount < MAX_RETRIES) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retryCount++;

      if (retryCount >= MAX_RETRIES) {
        break;
      }

      const baseDelay = 1000 * Math.pow(2, retryCount);
      const jitter = Math.random() * 0.3 * baseDelay;
      await new Promise<void>((resolve) =>
        setTimeout(resolve, baseDelay + jitter),
      );
    }
  }

  throw lastError || new Error("Unknown error occurred during fetch");
}
