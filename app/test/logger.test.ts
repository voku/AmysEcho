import { logger, LogLevel } from '../src/utils/logger';

(async () => {
  let captured = '';
  const orig = console.log;
  console.log = (msg?: any, ...args: any[]) => {
    captured += String(msg);
  };

  logger.setLevel(LogLevel.INFO);
  logger.debug('secret');
  if (captured.includes('secret')) {
    throw new Error('Debug log should not appear when level INFO');
  }

  logger.setLevel(LogLevel.DEBUG);
  logger.debug('hello');
  console.log = orig;
  if (!captured.includes('[DEBUG] hello')) {
    throw new Error('Debug log missing when level DEBUG');
  }
  console.log('logger test ok');
})();
