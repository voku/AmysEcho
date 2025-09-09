/**
 * API client utilities for Amy's Echo app
 * Provides consistent API calling patterns and error handling
 */

import { logger } from './logger';
import { withRetry, handleApiError, isRetryableError } from './errorUtils';

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
  headers?: Record<string, string>;
  duration?: number;
}

/**
 * Makes an API request with consistent error handling and logging
 */
export async function apiRequest<T = any>(
  url: string,
  options: ApiRequestOptions = {}
): Promise<ApiResponse<T>> {
  const {
    method = 'GET',
    headers = {},
    body,
    timeout = 30000,
    retries = 2,
    retryDelay = 1000
  } = options;

  const startTime = Date.now();

  // Prepare request options
  const requestOptions: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    signal: AbortSignal.timeout ? AbortSignal.timeout(timeout) : undefined
  };

  if (body && typeof body === 'object') {
    requestOptions.body = JSON.stringify(body);
  } else if (body) {
    requestOptions.body = body;
  }

  const operation = async (): Promise<ApiResponse<T>> => {
    logger.apiCall(url, method);

    const response = await fetch(url, requestOptions);
    const duration = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
    }

    let data: T;
    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      data = await response.json();
    } else {
      data = (await response.text()) as unknown as T;
    }

    logger.apiCall(url, method, response.status, duration);

    return {
      success: true,
      data,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      duration
    };
  };

  // Use retry logic for failed requests
  const shouldRetryFn = (error: Error) => {
    const retryable = isRetryableError(error);
    if (!retryable) {
      logger.warn(`Not retrying ${method} ${url}: ${error.message}`);
    }
    return retryable;
  };

  const result = await withRetry(
    operation,
    `API ${method} ${url}`,
    {
      maxAttempts: retries + 1, // +1 for initial attempt
      delayMs: retryDelay,
      shouldRetry: shouldRetryFn
    }
  );

  if (!result.success) {
    return handleApiError(result.error, url, method);
  }

  return result.data!;
}

/**
 * Makes a GET request
 */
export async function apiGet<T = any>(
  url: string,
  options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
): Promise<ApiResponse<T>> {
  return apiRequest<T>(url, { ...options, method: 'GET' });
}

/**
 * Makes a POST request
 */
export async function apiPost<T = any>(
  url: string,
  body?: any,
  options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
): Promise<ApiResponse<T>> {
  return apiRequest<T>(url, { ...options, method: 'POST', body });
}

/**
 * Makes a PUT request
 */
export async function apiPut<T = any>(
  url: string,
  body?: any,
  options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
): Promise<ApiResponse<T>> {
  return apiRequest<T>(url, { ...options, method: 'PUT', body });
}

/**
 * Makes a DELETE request
 */
export async function apiDelete<T = any>(
  url: string,
  options: Omit<ApiRequestOptions, 'method' | 'body'> = {}
): Promise<ApiResponse<T>> {
  return apiRequest<T>(url, { ...options, method: 'DELETE' });
}

/**
 * Gets the API base URL from environment
 */
export function getApiBaseUrl(): string {
  return process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5000';
}

/**
 * Builds a full API URL
 */
export function buildApiUrl(endpoint: string): string {
  const baseUrl = getApiBaseUrl();
  return `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
}

/**
 * Creates authorization headers
 */
export function createAuthHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Handles API response validation
 */
export function validateApiResponse<T>(
  response: ApiResponse<T>,
  requiredFields: (keyof T)[] = []
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!response.success) {
    errors.push(`API request failed: ${response.error}`);
    return { valid: false, errors };
  }

  if (!response.data) {
    errors.push('API response data is empty');
    return { valid: false, errors };
  }

  // Check required fields only when data is an object
  if (response.data && typeof response.data === 'object') {
    for (const field of requiredFields) {
      const hasField = (response.data as any)[field as any] !== undefined;
      if (!hasField) {
        errors.push(`Required field '${String(field)}' is missing from API response`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
