import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gestureDataProtector } from './dataProtection';

const sampleGesture = {
  gestureClass: 'wave',
  confidence: 0.92,
  timestamp: Date.now(),
  sessionId: 'session-123',
};

describe('gestureDataProtector', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('stores encrypted gestures with retention and anonymization', async () => {
    await gestureDataProtector.storeGesture(sampleGesture);
    const stored = JSON.parse(localStorage.getItem('protectedGestures') || '[]');
    expect(stored).toHaveLength(1);
    expect(typeof stored[0].data).toBe('string');

    const decrypted = await gestureDataProtector.decryptGesture(stored[0].data);
    expect(decrypted.gestureClass).toBe('wave');
    expect(decrypted.sessionId).not.toContain('session-123');
    expect(decrypted.timestamp).toBe(Math.floor(sampleGesture.timestamp / (24 * 60 * 60 * 1000)));
  });

  it('cleans up expired gestures', async () => {
    await gestureDataProtector.storeGesture(sampleGesture);
    const stored = JSON.parse(localStorage.getItem('protectedGestures') || '[]');
    stored[0].expires = Date.now() - 1000;
    localStorage.setItem('protectedGestures', JSON.stringify(stored));

    const expired = await gestureDataProtector.cleanupExpiredData();
    expect(expired).toBe(1);
    expect(JSON.parse(localStorage.getItem('protectedGestures') || '[]')).toHaveLength(0);
  });
});
