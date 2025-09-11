jest.unmock('../src/services/logger.js');

import type { Logger } from '../src/services/logger.js';

let logger: Logger;
beforeAll(async () => {
  ({ logger } = await import('../src/services/logger.js'));
});

describe('logger', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('apiRequest', () => {
    it('logs warning for 4xx/5xx responses', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      logger.apiRequest('GET', '/foo', 500, 100);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [output] = warnSpy.mock.calls[0];
      const entry = JSON.parse(output);
      expect(entry.level).toBe('WARN');
      expect(entry.message).toBe('GET /foo');
    });

    it('logs info for successful responses', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      logger.apiRequest('GET', '/foo', 200, 50);
      expect(logSpy).toHaveBeenCalledTimes(1);
      const [output] = logSpy.mock.calls[0];
      const entry = JSON.parse(output);
      expect(entry.level).toBe('INFO');
      expect(entry.message).toBe('GET /foo');
    });
  });

  describe('requestEnd', () => {
    it('logs warning for error status codes', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      logger.requestEnd('GET', '/foo', 500, 123);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const [output] = warnSpy.mock.calls[0];
      const entry = JSON.parse(output);
      expect(entry.level).toBe('WARN');
      expect(entry.message).toBe('GET /foo - Request completed');
    });

    it('logs info for successful status codes', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      logger.requestEnd('GET', '/foo', 200, 123);
      expect(logSpy).toHaveBeenCalledTimes(1);
      const [output] = logSpy.mock.calls[0];
      const entry = JSON.parse(output);
      expect(entry.level).toBe('INFO');
      expect(entry.message).toBe('GET /foo - Request completed');
    });
  });
});
