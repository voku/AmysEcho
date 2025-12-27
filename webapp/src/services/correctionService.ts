/**
 * Correction Service for Web
 * Logs gesture corrections and negative samples to the server.
 */

import { logger } from './logger';
import type { ApiClientConfig } from './apiClient';
import { buildAuthHeaders } from './apiClient';

export const correctionService = {
  async logCorrection(sign: string, config: ApiClientConfig): Promise<void> {
    const apiUrl = config.apiBaseUrl;
    const token = config.apiToken;

    try {
      await fetch(`${apiUrl}/api/v1/corrections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(token),
        },
        body: JSON.stringify({ sign }),
      });
      logger.debug('Correction logged:', sign);
    } catch (error) {
      logger.warn('Failed to log correction:', error);
    }
  },

  async logNegativeSample(sign: string, config: ApiClientConfig): Promise<void> {
    const apiUrl = config.apiBaseUrl;
    const token = config.apiToken;

    try {
      await fetch(`${apiUrl}/api/v1/negative-samples`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(token),
        },
        body: JSON.stringify({ sign }),
      });
      logger.debug('Negative sample logged:', sign);
    } catch (error) {
      logger.warn('Failed to log negative sample:', error);
    }
  },
};

export default correctionService;
