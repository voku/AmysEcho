/**
 * Simple logger for webapp
 */

const isDev = typeof process !== 'undefined' 
  ? process.env['NODE_ENV'] === 'development'
  : import.meta.env?.DEV ?? false;

export const logger = {
  debug: (...args: unknown[]) => {
    if (isDev) {
      console.debug('[Amy]', ...args);
    }
  },
  info: (...args: unknown[]) => {
    console.info('[Amy]', ...args);
  },
  warn: (...args: unknown[]) => {
    console.warn('[Amy]', ...args);
  },
  error: (...args: unknown[]) => {
    console.error('[Amy]', ...args);
  },
};
