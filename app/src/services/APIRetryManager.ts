import { logger } from '../utils/logger';

export class APIRetryManager {
  private readonly maxRetries: number;
  private readonly baseDelay: number;

  constructor(maxRetries = 3, baseDelay = 1000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
  }

  async executeWithRetry<T>(operation: () => Promise<T>, context: string): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt);
          logger.warn(
            `${context} failed (attempt ${attempt + 1}/${this.maxRetries + 1}), retrying in ${delay}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    logger.error(`API failure in ${context}:`, lastError);
    throw lastError;
  }
}

export default APIRetryManager;
