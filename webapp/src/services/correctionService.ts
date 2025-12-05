/**
 * Correction Service for Web
 * Logs gesture corrections and negative samples to the server.
 */

import { logger } from './logger';
import type { ApiClientConfig } from './apiClient';
import { buildAuthHeaders } from './apiClient';

export const correctionService = {
  async logCorrection(gesture: string, config: ApiClientConfig): Promise<void> {
    const apiUrl = config.apiBaseUrl;
    const token = config.apiToken;

    try {
      await fetch(`${apiUrl}/api/corrections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(token),
        },
        body: JSON.stringify({ gesture }),
      });
      logger.debug('Correction logged:', gesture);
    } catch (error) {
      logger.warn('Failed to log correction:', error);
    }
  },

  async logNegativeSample(gesture: string, config: ApiClientConfig): Promise<void> {
    const apiUrl = config.apiBaseUrl;
    const token = config.apiToken;

    try {
      await fetch(`${apiUrl}/api/negative-samples`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(token),
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
