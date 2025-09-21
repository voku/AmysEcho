export const BATCH_INTERVAL_MS = 50;
export const MAX_BATCH_SIZE = 5;
export const FRAME_LATENCY_SAMPLE_INTERVAL = 10;

type BridgePayload = Record<string, unknown>;

type QueueOptions = {
  flushImmediately?: boolean;
};

export class MessageBatcher {
  private queue: BridgePayload[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private frameCount = 0;
  private lastSentAt = 0;

  queueMessage(payload: BridgePayload, options: QueueOptions = {}): void {
    this.queue.push(payload);
    this.frameCount += 1;

    if (options.flushImmediately) {
      this.forceFlush();
      return;
    }

    if (this.queue.length >= MAX_BATCH_SIZE || this.frameCount % FRAME_LATENCY_SAMPLE_INTERVAL === 0) {
      this.flushBatch();
      return;
    }

    if (!this.timer) {
      this.timer = setTimeout(() => this.flushBatch(), BATCH_INTERVAL_MS);
    }
  }

  flushBatch(): void {
    if (!this.queue.length) {
      this.clearTimer();
      return;
    }

    const messages = this.queue.slice();
    this.queue = [];
    this.clearTimer();

    const batchPayload = {
      type: 'gesture_batch',
      frameCount: messages.length,
      lastSentAt: Date.now(),
      messages,
    };

    try {
      if (window.ReactNativeWebView?.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(batchPayload));
      } else {
        console.warn('MessageBatcher: ReactNativeWebView not available, logging batch', batchPayload);
      }
      this.lastSentAt = batchPayload.lastSentAt;
    } catch (error) {
      console.error('MessageBatcher failed to flush batch:', error);
    } finally {
      this.frameCount = 0;
    }
  }

  forceFlush(): void {
    this.flushBatch();
  }

  getQueueStatus(): { pending: number; frameCount: number; lastSentAt: number } {
    return {
      pending: this.queue.length,
      frameCount: this.frameCount,
      lastSentAt: this.lastSentAt,
    };
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

export const messageBatcher = new MessageBatcher();
