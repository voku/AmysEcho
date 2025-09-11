jest.unmock('../src/services/logger.js');

let logger: any;
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
      expect(warnSpy).toHaveBeenCalled();
    });

    it('logs info for successful responses', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      logger.apiRequest('GET', '/foo', 200, 50);
      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('requestEnd', () => {
    it('logs warning for error status codes', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      logger.requestEnd('GET', '/foo', 500, 123);
      expect(warnSpy).toHaveBeenCalled();
    });

    it('logs info for successful status codes', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      logger.requestEnd('GET', '/foo', 200, 123);
      expect(logSpy).toHaveBeenCalled();
    });
  });
});
