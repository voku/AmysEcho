// @ts-nocheck
import type { WebViewMessagePayload } from '../types/MediaPipeTypes';

export const BATCH_INTERVAL_MS = 35;
export const MAX_BATCH_SIZE = 6;
export const FRAME_LATENCY_SAMPLE_INTERVAL = 6;
const MAX_QUEUE_LATENCY_MS = 120;

type BridgePayload = Record<string, unknown> | WebViewMessagePayload;

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

    if (
      this.queue.length >= MAX_BATCH_SIZE ||
      (this.frameCount > 0 && this.frameCount % FRAME_LATENCY_SAMPLE_INTERVAL === 0)
    ) {
      this.flushBatch();
      return;
    }

    const now = Date.now();
    if (this.lastSentAt && now - this.lastSentAt >= MAX_QUEUE_LATENCY_MS) {
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
      messageCount: messages.length,
      frameCount: this.frameCount,
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
