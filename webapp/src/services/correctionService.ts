/**
 * Correction Service for Web
 * Logs gesture corrections and negative samples to the server.
 */

import { logger } from './logger';

const getApiUrl = (): string => {
  return localStorage.getItem('apiUrl') ?? 'http://localhost:5000';
};

const getApiToken = (): string | null => {
  return sessionStorage.getItem('apiToken');
};

export const correctionService = {
  async logCorrection(gesture: string): Promise<void> {
    const apiUrl = getApiUrl();
    const token = getApiToken();
    
    try {
      await fetch(`${apiUrl}/api/corrections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ gesture }),
      });
      logger.debug('Correction logged:', gesture);
    } catch (error) {
      logger.warn('Failed to log correction:', error);
    }
  },

  async logNegativeSample(gesture: string): Promise<void> {
    const apiUrl = getApiUrl();
    const token = getApiToken();
    
    try {
      await fetch(`${apiUrl}/api/negative-samples`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ gesture }),
      });
      logger.debug('Negative sample logged:', gesture);
    } catch (error) {
      logger.warn('Failed to log negative sample:', error);
    }
  },
};

export default correctionService;
