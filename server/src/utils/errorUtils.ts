/**
 * Error handling utilities for Amy's Echo server
 * Provides consistent error handling patterns across the server
 */

import { logger } from "../services/logger.js";

export interface ErrorResult<T = any> {
	success: boolean;
	data?: T;
	error?: string;
	code?: string;
	statusCode?: number;
}

export interface RetryOptions {
	maxAttempts?: number;
	delayMs?: number;
	backoffMultiplier?: number;
	shouldRetry?: (error: Error) => boolean;
}

/**
 * Wraps an async operation with error handling
 */
export async function withErrorHandling<T>(
	operation: () => Promise<T>,
	context: string,
	fallback?: T,
): Promise<ErrorResult<T>> {
	try {
		const data = await operation();
		return { success: true, data };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error(`Error in ${context}: ${errorMessage}`, error);
		return {
			success: false,
			error: errorMessage,
			data: fallback,
		};
	}
}

/**
 * Wraps a sync operation with error handling
 */
export function withSyncErrorHandling<T>(
	operation: () => T,
	context: string,
	fallback?: T,
): ErrorResult<T> {
	try {
		const data = operation();
		return { success: true, data };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.error(`Error in ${context}: ${errorMessage}`, error);
		return {
			success: false,
			error: errorMessage,
			data: fallback,
		};
	}
}

/**
 * Retries an async operation with exponential backoff
 */
export async function withRetry<T>(
	operation: () => Promise<T>,
	context: string,
	options: RetryOptions = {},
): Promise<ErrorResult<T>> {
	const {
		maxAttempts = 3,
		delayMs = 1000,
		backoffMultiplier = 2,
		shouldRetry = () => true,
	} = options;

	let lastError: Error = new Error("No error occurred");
	let currentDelay = delayMs;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const data = await operation();
			if (attempt > 1) {
				logger.info(`Operation ${context} succeeded on attempt ${attempt}`);
			}
			return { success: true, data };
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			if (attempt === maxAttempts || !shouldRetry(lastError)) {
				logger.error(
					`Operation ${context} failed after ${attempt} attempts: ${lastError.message}`,
				);
				return {
					success: false,
					error: lastError.message,
					code: "MAX_RETRIES_EXCEEDED",
				};
			}

			logger.warn(
				`Operation ${context} failed on attempt ${attempt}, retrying in ${currentDelay}ms: ${lastError.message}`,
			);
			await new Promise((resolve) => setTimeout(resolve, currentDelay));
			currentDelay *= backoffMultiplier;
		}
	}

	// This should never be reached, but TypeScript requires it
	return {
		success: false,
		error: lastError?.message || "Unknown error",
		code: "UNEXPECTED_ERROR",
	};
}

/**
 * Creates a standardized error message
 */
export function createErrorMessage(
	operation: string,
	error: unknown,
	additionalInfo?: Record<string, any>,
): string {
	const baseMessage = `${operation} failed`;
	const errorMessage = error instanceof Error ? error.message : String(error);

	if (additionalInfo) {
		const infoStr = Object.entries(additionalInfo)
			.map(([key, value]) => `${key}: ${value}`)
			.join(", ");
		return `${baseMessage}: ${errorMessage} (${infoStr})`;
	}

	return `${baseMessage}: ${errorMessage}`;
}

/**
 * Checks if an error is retryable
 */
export function isRetryableError(error: Error): boolean {
	// Network errors are typically retryable
	if (
		error.message.includes("ECONNREFUSED") ||
		error.message.includes("ENOTFOUND") ||
		error.message.includes("timeout")
	) {
		return true;
	}

	// HTTP 5xx errors are retryable
	if (error.message.includes("HTTP 5")) {
		return true;
	}

	// Database connection errors are retryable
	if (
		error.message.includes("connection") ||
		error.message.includes("pool") ||
		error.message.includes("timeout")
	) {
		return true;
	}

	// Don't retry authentication errors
	if (error.message.includes("401") || error.message.includes("403")) {
		return false;
	}

	// Don't retry validation errors
	if (
		error.message.includes("validation") ||
		error.message.includes("invalid")
	) {
		return false;
	}

	return true;
}

/**
 * Handles API errors consistently
 */
export function handleApiError(
	error: unknown,
	endpoint: string,
	method: string = "GET",
	statusCode?: number,
): ErrorResult {
	const errorMessage = error instanceof Error ? error.message : String(error);

	logger.error(`API ${method} ${endpoint} failed: ${errorMessage}`, {
		endpoint,
		method,
		statusCode,
		error: errorMessage,
	});

	return {
		success: false,
		error: errorMessage,
		code: "API_ERROR",
		statusCode,
	};
}

/**
 * Handles database errors consistently
 */
export function handleDatabaseError(
	error: unknown,
	operation: string,
	table?: string,
): ErrorResult {
	const errorMessage = error instanceof Error ? error.message : String(error);

	logger.error(`Database ${operation} failed: ${errorMessage}`, {
		operation,
		table,
		error: errorMessage,
	});

	return {
		success: false,
		error: errorMessage,
		code: "DATABASE_ERROR",
	};
}

/**
 * Safe JSON parsing with error handling
 */
export function safeJsonParse<T = any>(
	jsonString: string,
	fallback?: T,
	context: string = "JSON parsing",
): ErrorResult<T> {
	return withSyncErrorHandling(() => JSON.parse(jsonString), context, fallback);
}

/**
 * Safe JSON stringification with error handling
 */
export function safeJsonStringify(
	data: any,
	fallback: string = "{}",
	context: string = "JSON stringification",
): ErrorResult<string> {
	return withSyncErrorHandling(() => JSON.stringify(data), context, fallback);
}

/**
 * Creates HTTP error responses
 */
export function createHttpError(
	message: string,
	statusCode: number = 500,
	code?: string,
	details?: any,
): { error: string; code?: string; details?: any; statusCode: number } {
	return {
		error: message,
		code,
		details,
		statusCode,
	};
}

/**
 * Express.js error handler middleware factory
 */
export function createErrorHandler(logContext?: string) {
	return (error: Error, req: any, res: any, _next: any) => {
		const context = logContext || "HTTP request";
		const errorMessage = error.message || "Internal server error";

		logger.error(`${context} error: ${errorMessage}`, {
			method: req.method,
			url: req.url,
			userAgent: req.get("User-Agent"),
			ip: req.ip,
			stack: error.stack,
		});

		// Don't leak error details in production
		const isDevelopment = process.env.NODE_ENV === "development";
		const responseError = isDevelopment
			? errorMessage
			: "Internal server error";

		res.status(500).json({
			error: responseError,
			code: "INTERNAL_ERROR",
			...(isDevelopment && { stack: error.stack }),
		});
	};
}
