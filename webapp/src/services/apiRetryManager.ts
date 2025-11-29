/**
 * API Retry Manager
 * Provides robust retry logic for API calls with exponential backoff
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatusCodes: number[];
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalTimeMs: number;
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryableStatusCodes: [408, 429, 500, 502, 503, 504],
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateDelay(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  const jitter = Math.random() * 0.3 * delay; // Add up to 30% jitter
  return Math.min(delay + jitter, config.maxDelayMs);
}

function isRetryableError(error: unknown, config: RetryConfig): boolean {
  if (error instanceof TypeError) {
    // Network errors (fetch failed)
    return true;
  }
  
  if (error instanceof Response) {
    return config.retryableStatusCodes.includes(error.status);
  }
  
  return false;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<RetryResult<T>> {
  const fullConfig: RetryConfig = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  let lastError: Error | undefined;
  let attempt = 0;

  while (attempt <= fullConfig.maxRetries) {
    try {
      const data = await operation();
      return {
        success: true,
        data,
        attempts: attempt + 1,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt >= fullConfig.maxRetries || !isRetryableError(error, fullConfig)) {
        break;
      }

      const delay = calculateDelay(attempt, fullConfig);
      console.info(`[APIRetry] Versuch ${attempt + 1} fehlgeschlagen, wiederhole in ${Math.round(delay)}ms...`);
      await sleep(delay);
      attempt += 1;
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: attempt + 1,
    totalTimeMs: Date.now() - startTime,
  };
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryConfig: Partial<RetryConfig> = {},
): Promise<Response> {
  const result = await withRetry(async () => {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const config = { ...DEFAULT_CONFIG, ...retryConfig };
      if (config.retryableStatusCodes.includes(response.status)) {
        throw response;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return response;
  }, retryConfig);

  if (!result.success) {
    throw result.error ?? new Error('Request fehlgeschlagen');
  }

  return result.data!;
}

// Convenience wrapper for JSON APIs
export async function fetchJsonWithRetry<T>(
  url: string,
  options: RequestInit = {},
  retryConfig: Partial<RetryConfig> = {},
): Promise<T> {
  const response = await fetchWithRetry(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  }, retryConfig);
  
  return response.json() as Promise<T>;
}

// POST with retry
export async function postWithRetry<T>(
  url: string,
  body: unknown,
  options: RequestInit = {},
  retryConfig: Partial<RetryConfig> = {},
): Promise<T> {
  return fetchJsonWithRetry<T>(url, {
    ...options,
    method: 'POST',
    body: JSON.stringify(body),
  }, retryConfig);
}

// Upload with retry (for FormData/Blob)
export async function uploadWithRetry(
  url: string,
  formData: FormData,
  options: RequestInit = {},
  retryConfig: Partial<RetryConfig> = {},
): Promise<Response> {
  return fetchWithRetry(url, {
    ...options,
    method: 'POST',
    body: formData,
  }, retryConfig);
}

export class APIRetryManager {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async execute<T>(operation: () => Promise<T>): Promise<RetryResult<T>> {
    return withRetry(operation, this.config);
  }

  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    return fetchWithRetry(url, options, this.config);
  }

  async fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
    return fetchJsonWithRetry<T>(url, options, this.config);
  }

  async post<T>(url: string, body: unknown, options: RequestInit = {}): Promise<T> {
    return postWithRetry<T>(url, body, options, this.config);
  }

  async upload(url: string, formData: FormData, options: RequestInit = {}): Promise<Response> {
    return uploadWithRetry(url, formData, options, this.config);
  }
}

export const apiRetryManager = new APIRetryManager();
