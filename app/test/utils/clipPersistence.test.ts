import { ClipCaptureError, persistClipToDirectory, sanitizeClipBase64 } from '../../src/utils/clipPersistence';
import type { ClipReadyPayload } from '../../src/types/frames';

type MockFs = {
  documentDirectory?: string | null;
  cacheDirectory?: string | null;
  EncodingType?: { Base64?: 'base64' };
  getInfoAsync: jest.Mock<Promise<{ exists: boolean; isDirectory?: boolean }>, [string]>;
  makeDirectoryAsync: jest.Mock<Promise<void>, [string, { intermediates?: boolean }?]>;
  writeAsStringAsync: jest.Mock<Promise<void>, [string, string, { encoding: 'base64' | 'utf8' }]>;
};

const createClip = (overrides: Partial<ClipReadyPayload> = {}): ClipReadyPayload => ({
  id: 'clip123',
  base64: 'ZGF0YQ==',
  mimeType: 'video/webm',
  durationMs: 1200,
  frameCount: 30,
  capturedAt: new Date(0).toISOString(),
  ...overrides,
});

const createFs = (overrides: Partial<MockFs> = {}): MockFs => ({
  documentDirectory: 'file:///docs/',
  cacheDirectory: 'file:///cache/',
  EncodingType: { Base64: 'base64' },
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, isDirectory: true }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(),
  writeAsStringAsync: jest.fn().mockResolvedValue(),
  ...overrides,
});

describe('clipPersistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sanitizes base64 payloads by removing data URL prefix and whitespace', () => {
    const payload = '  data:video/webm;base64, AAAA\n/ +/=  ';
    expect(sanitizeClipBase64(payload)).toBe('AAAA/+/=');
  });

  it('returns empty string when payload includes invalid characters', () => {
    const payload = 'data:video/webm;base64, AAAA$BBB=';
    expect(sanitizeClipBase64(payload)).toBe('');
  });

  it('returns empty string when payload length is not a multiple of 4', () => {
    const payload = 'data:video/webm;base64, AAA';
    expect(sanitizeClipBase64(payload)).toBe('');
  });

  it('writes sanitized clip data into the document directory when available', async () => {
    const fs = createFs();
    const clip = createClip({
      base64: 'data:video/webm;base64, A A A A /+/= ',
    });
    const warn = jest.fn();

    const uri = await persistClipToDirectory({
      fs: fs as any,
      clip,
      directoryName: 'amy-training-clips',
      filePrefix: 'amy-training',
      logger: { warn },
    });

    expect(uri).toBe('file:///docs/amy-training-clips/amy-training-clip123.webm');
    expect(fs.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///docs/amy-training-clips/amy-training-clip123.webm',
      'AAAA/+/=',
      { encoding: 'base64' },
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to cache directory when document directory is unavailable', async () => {
    const fs = createFs({ documentDirectory: null });
    const clip = createClip();

    const uri = await persistClipToDirectory({
      fs: fs as any,
      clip,
      directoryName: 'amy',
      filePrefix: 'amy',
    });

    expect(uri).toBe('file:///cache/amy/amy-clip123.webm');
  });

  it('throws a ClipCaptureError when the payload is empty after sanitization', async () => {
    const fs = createFs();
    const clip = createClip({ base64: '   ' });
    const warn = jest.fn();

    await expect(
      persistClipToDirectory({
        fs: fs as any,
        clip,
        directoryName: 'amy',
        filePrefix: 'amy',
        logger: { warn },
      }),
    ).rejects.toMatchObject({ message: 'clip_payload_invalid' });

    expect(warn).toHaveBeenCalledWith('Clip-base64-Payload fehlt oder ist ungültig', {
      clipId: 'clip123',
      mimeType: 'video/webm',
    });
    expect(fs.writeAsStringAsync).not.toHaveBeenCalled();
  });

  it('throws a ClipCaptureError when sanitized payload contains invalid characters', async () => {
    const fs = createFs();
    const clip = createClip({ base64: 'data:video/webm;base64, @@notbase64@@' });
    const warn = jest.fn();

    await expect(
      persistClipToDirectory({
        fs: fs as any,
        clip,
        directoryName: 'amy',
        filePrefix: 'amy',
        logger: { warn },
      }),
    ).rejects.toMatchObject({ message: 'clip_payload_invalid' });

    expect(warn).toHaveBeenCalledWith('Clip-base64-Payload fehlt oder ist ungültig', {
      clipId: 'clip123',
      mimeType: 'video/webm',
    });
  });

  it('wraps write failures in a ClipCaptureError', async () => {
    const writeError = new Error('disk full');
    const fs = createFs({
      writeAsStringAsync: jest.fn().mockRejectedValue(writeError),
    });
    const clip = createClip();
    const warn = jest.fn();

    await expect(
      persistClipToDirectory({
        fs: fs as any,
        clip,
        directoryName: 'amy',
        filePrefix: 'amy',
        logger: { warn },
      }),
    ).rejects.toEqual(new ClipCaptureError('clip_write_failed'));

    expect(warn).toHaveBeenCalledWith('Clip konnte nicht gespeichert werden', writeError);
  });
});
