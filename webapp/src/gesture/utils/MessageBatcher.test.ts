import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { MessageBatcher, BATCH_INTERVAL_MS_35, MAX_BATCH_SIZE_6 } from './MessageBatcher';
import { WEBVIEW_MESSAGE_EVENT } from '../../utils/reactNativeBridge';

describe('MessageBatcher', () => {
  let messageBatcher: MessageBatcher;
  let dispatchEventSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    messageBatcher = new MessageBatcher();
    dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    vi.useRealTimers();
    dispatchEventSpy.mockRestore();
  });

  describe('queueMessage', () => {
    it('queues messages and flushes after interval', () => {
      messageBatcher.queueMessage({ type: 'test', data: 1 });

      expect(dispatchEventSpy).not.toHaveBeenCalled();

      vi.advanceTimersByTime(BATCH_INTERVAL_MS_35);

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
      const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe(WEBVIEW_MESSAGE_EVENT);
      const detail = JSON.parse(event.detail as string);
      expect(detail.type).toBe('gesture_batch');
      expect(detail.messages).toHaveLength(1);
    });

    it('batches multiple messages together', () => {
      messageBatcher.queueMessage({ type: 'test', data: 1 });
      messageBatcher.queueMessage({ type: 'test', data: 2 });
      messageBatcher.queueMessage({ type: 'test', data: 3 });

      vi.advanceTimersByTime(BATCH_INTERVAL_MS_35);

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
      const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent;
      const detail = JSON.parse(event.detail as string);
      expect(detail.messages).toHaveLength(3);
    });

    it('flushes immediately when batch size reached', () => {
      for (let i = 0; i < MAX_BATCH_SIZE_6; i++) {
        messageBatcher.queueMessage({ type: 'test', index: i });
      }

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
      const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent;
      const detail = JSON.parse(event.detail as string);
      expect(detail.messages).toHaveLength(MAX_BATCH_SIZE_6);
    });

    it('flushes immediately with flushImmediately option', () => {
      messageBatcher.queueMessage({ type: 'urgent' }, { flushImmediately: true });

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('flushBatch', () => {
    it('does nothing when queue is empty', () => {
      messageBatcher.flushBatch();

      expect(dispatchEventSpy).not.toHaveBeenCalled();
    });

    it('clears the queue after flushing', () => {
      messageBatcher.queueMessage({ type: 'test' });
      messageBatcher.flushBatch();

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1);

      messageBatcher.flushBatch();
      expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
    });

    it('dispatches CustomEvent with correct batch payload structure', () => {
      messageBatcher.queueMessage({ type: 'frame', data: 'landmarks' });
      messageBatcher.flushBatch();

      const event = dispatchEventSpy.mock.calls[0][0] as CustomEvent;
      expect(event.type).toBe(WEBVIEW_MESSAGE_EVENT);

      const detail = JSON.parse(event.detail as string);
      expect(detail.type).toBe('gesture_batch');
      expect(detail.messageCount).toBe(1);
      expect(detail.frameCount).toBe(1);
      expect(typeof detail.lastSentAt).toBe('number');
      expect(detail.messages).toEqual([{ type: 'frame', data: 'landmarks' }]);
    });
  });

  describe('forceFlush', () => {
    it('immediately flushes pending messages', () => {
      messageBatcher.queueMessage({ type: 'test' });

      expect(dispatchEventSpy).not.toHaveBeenCalled();

      messageBatcher.forceFlush();

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getQueueStatus', () => {
    it('returns correct queue status', () => {
      const status = messageBatcher.getQueueStatus();
      expect(status.pending).toBe(0);
      expect(status.frameCount).toBe(0);
      expect(status.lastSentAt).toBe(0);
    });

    it('updates pending count after queueing', () => {
      messageBatcher.queueMessage({ type: 'test' });
      messageBatcher.queueMessage({ type: 'test' });

      const status = messageBatcher.getQueueStatus();
      expect(status.pending).toBe(2);
      expect(status.frameCount).toBe(2);
    });

    it('resets frame count after flush', () => {
      messageBatcher.queueMessage({ type: 'test' });
      messageBatcher.flushBatch();

      const status = messageBatcher.getQueueStatus();
      expect(status.pending).toBe(0);
      expect(status.frameCount).toBe(0);
      expect(status.lastSentAt).toBeGreaterThan(0);
    });
  });
});
