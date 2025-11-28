import { logger, LogLevel } from '../src/utils/logger';

describe('Logger', () => {
  it('should only log messages at or above the current log level', () => {
    let captured = '';
    const orig = console.log;
    console.log = (msg?: any) => {
      captured += String(msg);
    };

    logger.setLevel(LogLevel.INFO);
    logger.debug('secret');
    expect(captured).not.toContain('secret');

    logger.setLevel(LogLevel.DEBUG);
    logger.debug('hello');
    console.log = orig;
    expect(captured).toContain('[DEBUG] hello');
  });
});