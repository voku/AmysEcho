import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backupService } from './backupService';
import { gestureDataProtector } from './dataProtection';

const blobText = async (input: Blob | null): Promise<string> => {
  if (!input) return '';
  if (typeof (input as any).text === 'function') {
    return (input as any).text();
  }
  return new Response(input).text();
};

describe('backupService', () => {
  let lastBlob: Blob | null = null;
  beforeEach(async () => {
    localStorage.clear();
    lastBlob = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
      if (obj instanceof Blob) {
        lastBlob = obj;
      }
      return 'blob://test';
    });
    await gestureDataProtector.storeGesture({
      gestureClass: 'hilfe',
      confidence: 0.9,
      timestamp: Date.now(),
      sessionId: 'abc',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates encrypted backup artifacts', async () => {
    const artifact = await backupService.backupProtectedGestures();
    expect(artifact?.url).toBe('blob://test');
    expect(artifact?.fileName).toBe('protectedGesturesBackup.dat');
    const payload = await blobText(lastBlob);
    expect(payload).toBeTypeOf('string');
    expect(payload.length).toBeGreaterThan(10);
    expect(localStorage.getItem('protectedGesturesBackupPayload')).toBeTruthy();
  });

  it('restores from encrypted backup payload', async () => {
    await backupService.backupProtectedGestures();
    localStorage.removeItem('protectedGestures');
    const ok = await backupService.restoreProtectedGestures();
    expect(ok).toBe(true);
    expect(localStorage.getItem('protectedGestures')).toBeTruthy();
  });

  it('restores from an imported backup file', async () => {
    await backupService.backupProtectedGestures();
    const backupPayload = localStorage.getItem('protectedGesturesBackupPayload');
    expect(backupPayload).toBeTruthy();
    localStorage.removeItem('protectedGestures');
    localStorage.removeItem('protectedGesturesBackupPayload');

    const ok = await backupService.restoreProtectedGesturesFromFile(
      new Blob([backupPayload ?? ''], { type: 'application/octet-stream' }),
    );
    expect(ok).toBe(true);
    expect(localStorage.getItem('protectedGestures')).toBeTruthy();
    expect(localStorage.getItem('protectedGesturesBackupPayload')).toBeTruthy();
  });

  it('exports decrypted gestures for download', async () => {
    const artifact = await backupService.exportProtectedGestures();
    expect(artifact?.fileName).toBe('protectedGesturesExport.json');
    const text = await blobText(lastBlob);
    const parsed = JSON.parse(text);
    expect(parsed[0].gestureClass).toBe('hilfe');
    expect(parsed[0].sessionId).toBeDefined();
  });
});
