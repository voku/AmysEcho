import { isRetryableError } from '../../src/utils/errorUtils';
import { logger } from '../../src/utils/logger';

jest.mock('../../src/utils/logger', () => {
  const warn = jest.fn();
  const mockLogger = {
    warn,
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  return {
    __esModule: true,
    logger: mockLogger,
    default: mockLogger,
  };
});

describe('isRetryableError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('treats network failures as retryable', () => {
    const error = new Error('Network timeout while fetching');

    expect(isRetryableError(error)).toBe(true);
  });

  it('treats HTTP 5xx failures as retryable', () => {
    const error = new Error('HTTP 503 Service Unavailable');

    expect(isRetryableError(error)).toBe(true);
  });

  it('does not retry authentication failures', () => {
    const error = new Error('HTTP 401: Token expired');

    expect(isRetryableError(error)).toBe(false);
  });

  it('does not retry validation failures', () => {
    const error = new Error('Validation failed: invalid input');

    expect(isRetryableError(error)).toBe(false);
  });

  it('logs and treats errors without messages as retryable', () => {
    const error = { name: 'UnknownError', message: undefined } as unknown as Error;

    expect(isRetryableError(error)).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      'isRetryableError received error without message',
      expect.objectContaining({ name: 'UnknownError' })
    );
  });

  it('is case-insensitive', () => {
    const error = new Error('NETWORK TIMEOUT while fetching');

    expect(isRetryableError(error)).toBe(true);
  });

  it('prefers retryable hints when both retryable and non-retryable keywords are present', () => {
    const error = new Error('Network error 401 while refreshing token');

    expect(isRetryableError(error)).toBe(true);
  });

  it('defaults to retryable when no known keywords are found', () => {
    const error = new Error('Something unexpected happened');

    expect(isRetryableError(error)).toBe(true);
  });
});
