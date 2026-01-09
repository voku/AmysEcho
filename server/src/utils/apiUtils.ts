/**
 * API client utilities for Amy's Echo server
 * Provides consistent API calling patterns and error handling
 */

import { logger } from "../services/logger.js";
import { handleApiError, isRetryableError, withRetry } from "./errorUtils.js";

export interface ApiRequestOptions {
	method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	headers?: Record<string, string>;
	body?: any;
	timeout?: number;
	retries?: number;
	retryDelay?: number;
	userId?: string;
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
	options: ApiRequestOptions = {},
): Promise<ApiResponse<T>> {
	const {
		method = "GET",
		headers = {},
		body,
		timeout = 30000,
		retries = 2,
		retryDelay = 1000,
		userId,
	} = options;

	const startTime = Date.now();

	// Prepare request options
	const requestOptions: RequestInit = {
		method,
		headers: {
			"Content-Type": "application/json",
			...headers,
		},
		signal: AbortSignal.timeout(timeout),
	};

	if (body && typeof body === "object") {
		requestOptions.body = JSON.stringify(body);
	} else if (body) {
		requestOptions.body = body;
	}

	const operation = async (): Promise<ApiResponse<T>> => {
		logger.apiRequest(method, url, undefined, undefined, userId);

		const response = await fetch(url, requestOptions);
		const duration = Date.now() - startTime;

		if (!response.ok) {
			const errorText = await response.text().catch(() => "Unknown error");
			throw new Error(
				`HTTP ${response.status}: ${response.statusText} - ${errorText}`,
			);
		}

		let data: T;
		const contentType = response.headers.get("content-type");

		if (contentType?.includes("application/json")) {
			data = await response.json();
		} else {
			data = (await response.text()) as unknown as T;
		}

		logger.apiRequest(method, url, response.status, duration, userId);

		return {
			success: true,
			data,
			status: response.status,
			headers: Object.fromEntries(response.headers.entries()),
			duration,
		};
	};

	// Use retry logic for failed requests
	const shouldRetryFn = (error: Error) => {
		const retryable = isRetryableError(error);
		if (!retryable) {
			logger.warn(
				`Not retrying ${method} ${url}: ${error.message}`,
				undefined,
				userId,
			);
		}
		return retryable;
	};

	const result = await withRetry(operation, `API ${method} ${url}`, {
		maxAttempts: retries + 1, // +1 for initial attempt
		delayMs: retryDelay,
		shouldRetry: shouldRetryFn,
	});

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
	options: Omit<ApiRequestOptions, "method" | "body"> = {},
): Promise<ApiResponse<T>> {
	return apiRequest<T>(url, { ...options, method: "GET" });
}

/**
 * Makes a POST request
 */
export async function apiPost<T = any>(
	url: string,
	body?: any,
	options: Omit<ApiRequestOptions, "method" | "body"> = {},
): Promise<ApiResponse<T>> {
	return apiRequest<T>(url, { ...options, method: "POST", body });
}

/**
 * Makes a PUT request
 */
export async function apiPut<T = any>(
	url: string,
	body?: any,
	options: Omit<ApiRequestOptions, "method" | "body"> = {},
): Promise<ApiResponse<T>> {
	return apiRequest<T>(url, { ...options, method: "PUT", body });
}

/**
 * Makes a DELETE request
 */
export async function apiDelete<T = any>(
	url: string,
	options: Omit<ApiRequestOptions, "method" | "body"> = {},
): Promise<ApiResponse<T>> {
	return apiRequest<T>(url, { ...options, method: "DELETE" });
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
	requiredFields: (keyof T)[] = [],
): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	if (!response.success) {
		errors.push(`API request failed: ${response.error}`);
		return { valid: false, errors };
	}

	if (!response.data) {
		errors.push("API response data is empty");
		return { valid: false, errors };
	}

	// Check required fields
	for (const field of requiredFields) {
		if (
			response.data &&
			typeof response.data === "object" &&
			!(field in response.data)
		) {
			errors.push(
				`Required field '${String(field)}' is missing from API response`,
			);
		}
	}

	return {
		valid: errors.length === 0,
		errors,
	};
}

/**
 * External API client for third-party services
 */
export class ExternalApiClient {
	private baseUrl: string;
	private defaultHeaders: Record<string, string>;
	private timeout: number;
	private retries: number;

	constructor(
		baseUrl: string,
		options: {
			headers?: Record<string, string>;
			timeout?: number;
			retries?: number;
			apiKey?: string;
		} = {},
	) {
		this.baseUrl = baseUrl;
		this.defaultHeaders = {
			"Content-Type": "application/json",
			...options.headers,
		};

		if (options.apiKey) {
			this.defaultHeaders.Authorization = `Bearer ${options.apiKey}`;
		}

		this.timeout = options.timeout || 30000;
		this.retries = options.retries || 2;
	}

	private buildUrl(endpoint: string): string {
		return `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
	}

	async request<T = any>(
		method: string,
		endpoint: string,
		options: {
			body?: any;
			headers?: Record<string, string>;
			userId?: string;
		} = {},
	): Promise<ApiResponse<T>> {
		const url = this.buildUrl(endpoint);
		const headers = { ...this.defaultHeaders, ...options.headers };

		return apiRequest<T>(url, {
			method: method as any,
			headers,
			body: options.body,
			timeout: this.timeout,
			retries: this.retries,
			userId: options.userId,
		});
	}

	async get<T = any>(
		endpoint: string,
		options?: { headers?: Record<string, string>; userId?: string },
	): Promise<ApiResponse<T>> {
		return this.request<T>("GET", endpoint, options);
	}

	async post<T = any>(
		endpoint: string,
		body?: any,
		options?: { headers?: Record<string, string>; userId?: string },
	): Promise<ApiResponse<T>> {
		return this.request<T>("POST", endpoint, { ...options, body });
	}

	async put<T = any>(
		endpoint: string,
		body?: any,
		options?: { headers?: Record<string, string>; userId?: string },
	): Promise<ApiResponse<T>> {
		return this.request<T>("PUT", endpoint, { ...options, body });
	}

	async delete<T = any>(
		endpoint: string,
		options?: { headers?: Record<string, string>; userId?: string },
	): Promise<ApiResponse<T>> {
		return this.request<T>("DELETE", endpoint, options);
	}
}
