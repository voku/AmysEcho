export const SESSION_EXPIRED_MESSAGE = 'Sitzung abgelaufen. Bitte neu anmelden.';

export class HttpError extends Error {
  constructor(public status: number, message: string, public retryAfterMs?: number) {
    super(message);
    this.name = 'HttpError';
  }
}

export type FetchRetryOptions = {
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
};

function sleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: FetchRetryOptions = {},
): Promise<Response> {
  const retries = options.retries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 300;
  const timeoutMs = options.timeoutMs ?? 20000;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (init?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const controller = init?.signal ? null : new AbortController();
    const signal = init?.signal ?? controller?.signal;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const requestInit = {
        ...init,
        ...(signal ? { signal } : {}),
      } satisfies RequestInit;
      const response = await fetch(input, requestInit);
      if (timeoutId) clearTimeout(timeoutId);
      return response;
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      lastError = error;
      if (attempt >= retries) break;
      await sleep(retryDelayMs);
    }
  }

  throw lastError;
}
