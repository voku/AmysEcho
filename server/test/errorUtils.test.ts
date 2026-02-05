import {
  withErrorHandling,
  withSyncErrorHandling,
  withRetry,
  safeJsonParse,
  safeJsonStringify,
  handleApiError,
  isRetryableError,
  createErrorMessage,
} from '../src/utils/errorUtils.js';

describe('errorUtils', () => {
  it('withErrorHandling returns data on success', async () => {
    const result = await withErrorHandling(async () => 'ok', 'test');
    expect(result).toEqual({ success: true, data: 'ok' });
  });

  it('withErrorHandling returns fallback on failure', async () => {
    const result = await withErrorHandling(async () => {
      throw new Error('fail');
    }, 'ctx', 'fb');
    expect(result).toEqual({ success: false, error: 'fail', data: 'fb' });
  });

  it('withSyncErrorHandling handles errors', () => {
    const result = withSyncErrorHandling(() => {
      throw new Error('fail');
    }, 'ctx', 'fb');
    expect(result).toEqual({ success: false, error: 'fail', data: 'fb' });
  });

  it('withRetry retries until success', async () => {
    let attempts = 0;
    const result = await withRetry(async () => {
      attempts++;
      if (attempts < 2) throw new Error('fail');
      return 'ok';
    }, 'retry-op', { maxAttempts: 3, delayMs: 1, backoffMultiplier: 1 });
    expect(result).toEqual({ success: true, data: 'ok' });
    expect(attempts).toBe(2);
  });

  it('withRetry returns error after max attempts', async () => {
    const result = await withRetry(async () => {
      throw new Error('fail');
    }, 'retry-op', { maxAttempts: 2, delayMs: 1, backoffMultiplier: 1 });
    expect(result.success).toBe(false);
    expect(result.code).toBe('MAX_RETRIES_EXCEEDED');
  });

  it('safeJsonParse parses valid JSON', () => {
    const result = safeJsonParse('{"a":1}');
    expect(result).toEqual({ success: true, data: { a: 1 } });
  });

  it('safeJsonParse handles invalid JSON', () => {
    const result = safeJsonParse('invalid', { a: 2 });
    expect(result).toEqual({ success: false, error: expect.any(String), data: { a: 2 } });
  });

  it('safeJsonStringify handles circular data', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    const result = safeJsonStringify(obj, 'fallback');
    expect(result).toEqual({ success: false, error: expect.any(String), data: 'fallback' });
  });

  it('handleApiError returns structured error', () => {
    const res = handleApiError(new Error('bad'), '/x', 'POST', 500);
    expect(res).toEqual({ success: false, error: 'bad', code: 'API_ERROR', statusCode: 500 });
  });

  it('isRetryableError returns true for network errors', () => {
    expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
    expect(isRetryableError(new Error('ENOTFOUND'))).toBe(true);
    expect(isRetryableError(new Error('timeout'))).toBe(true);
  });

  it('isRetryableError returns true for HTTP 5xx errors', () => {
    expect(isRetryableError(new Error('HTTP 500'))).toBe(true);
    expect(isRetryableError(new Error('HTTP 503'))).toBe(true);
  });

  it('isRetryableError returns false for auth errors', () => {
    expect(isRetryableError(new Error('401 Unauthorized'))).toBe(false);
    expect(isRetryableError(new Error('403 Forbidden'))).toBe(false);
  });

  it('isRetryableError returns false for validation errors', () => {
    expect(isRetryableError(new Error('validation failed'))).toBe(false);
    expect(isRetryableError(new Error('invalid input'))).toBe(false);
  });

  it('createErrorMessage formats simple errors', () => {
    const msg = createErrorMessage('save', new Error('oops'));
    expect(msg).toBe('save failed: oops');
  });

  it('createErrorMessage includes additional info', () => {
    const msg = createErrorMessage('save', new Error('oops'), { table: 'users' });
    expect(msg).toBe('save failed: oops (table: users)');
  });
});
