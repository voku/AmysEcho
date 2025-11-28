import {
  ClipCaptureError,
  DEFAULT_CLIP_CAPTURE_ERROR_MESSAGE,
  getClipCaptureErrorMessage,
  persistClipToDirectory,
  sanitizeClipBase64,
  canUseClipStorage,
  resolveClipBaseDirectory,
} from '../../src/utils/clipPersistence';
import type { ClipReadyPayload } from '../../src/types/frames';

type MockFs = {
  documentDirectory?: string | null;
  cacheDirectory?: string | null;
  storageDirectory?: string | null;
  externalDirectory?: string | null;
  externalCacheDirectory?: string | null;
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
  storageDirectory: 'file:///storage/',
  externalDirectory: 'file:///external/',
  externalCacheDirectory: 'file:///external-cache/',
  EncodingType: { Base64: 'base64' },
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, isDirectory: true }),
  makeDirectoryAsync: jest.fn().mockResolvedValue(),
  writeAsStringAsync: jest.fn().mockResolvedValue(),
  ...overrides,
});

const androidPlatform = { OS: 'android' as const, Version: 34 };
const iosPlatform = { OS: 'ios' as const, Version: '17.0' };

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

  it('writes sanitized clip data into the cache directory on scoped Android devices', async () => {
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
      platform: androidPlatform,
    });

    expect(uri).toBe('file:///cache/amy-training-clips/amy-training-clip123.webm');
    expect(fs.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///cache/amy-training-clips/amy-training-clip123.webm',
      'AAAA/+/=',
      { encoding: 'base64' },
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to cache directory when document directory is unavailable', async () => {
    const fs = createFs({
      documentDirectory: null,
      storageDirectory: null,
      externalDirectory: null,
      externalCacheDirectory: null,
    });
    const clip = createClip();

    const uri = await persistClipToDirectory({
      fs: fs as any,
      clip,
      directoryName: 'amy',
      filePrefix: 'amy',
      platform: androidPlatform,
    });

    expect(uri).toBe('file:///cache/amy/amy-clip123.webm');
  });

  it('uses document directory on non-Android platforms when available', async () => {
    const fs = createFs();
    const clip = createClip();

    const uri = await persistClipToDirectory({
      fs: fs as any,
      clip,
      directoryName: 'amy',
      filePrefix: 'amy',
      platform: iosPlatform,
    });

    expect(uri).toBe('file:///docs/amy/amy-clip123.webm');
  });

  it('erkennt vorhandenen Speicherort für Clips', () => {
    const fs = createFs();
    expect(resolveClipBaseDirectory(fs as any, androidPlatform as any)).toBe('file:///cache/');
    expect(canUseClipStorage(fs as any, androidPlatform as any)).toBe(true);
  });

  it('meldet fehlenden Speicherort für Clips', () => {
    const fs = createFs({
      documentDirectory: null,
      cacheDirectory: null,
      storageDirectory: null,
      externalDirectory: null,
      externalCacheDirectory: null,
    });
    expect(resolveClipBaseDirectory(fs as any, androidPlatform as any)).toBeNull();
    expect(canUseClipStorage(fs as any, androidPlatform as any)).toBe(false);
  });

  it('probiert alternative Speicherpfade, wenn das Vorbereitungsverzeichnis scheitert', async () => {
    const fs = createFs({
      getInfoAsync: jest.fn().mockImplementation((uri: string) => {
        if (uri.startsWith('file:///docs/')) {
          return Promise.reject(new Error('docs unavailable'));
        }
        return Promise.resolve({ exists: true, isDirectory: true });
      }),
    });

    const clip = createClip();

    const uri = await persistClipToDirectory({
      fs: fs as any,
      clip,
      directoryName: 'amy',
      filePrefix: 'amy',
      platform: iosPlatform,
    });

    expect(uri).toBe('file:///storage/amy/amy-clip123.webm');
    expect(fs.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///storage/amy/amy-clip123.webm',
      'ZGF0YQ==',
      { encoding: 'base64' },
    );
  });

  it('weicht auf einen alternativen Speicherpfad aus, wenn das Schreiben fehlschlägt', async () => {
    const fs = createFs({
      writeAsStringAsync: jest.fn().mockImplementation((uri: string) => {
        if (uri.startsWith('file:///docs/')) {
          return Promise.reject(new Error('doc read only'));
        }
        return Promise.resolve();
      }),
    });

    const clip = createClip();
    const warn = jest.fn();

    const uri = await persistClipToDirectory({
      fs: fs as any,
      clip,
      directoryName: 'amy',
      filePrefix: 'amy',
      logger: { warn },
      platform: iosPlatform,
    });

    expect(uri).toBe('file:///storage/amy/amy-clip123.webm');
    expect(fs.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///docs/amy/amy-clip123.webm',
      'ZGF0YQ==',
      { encoding: 'base64' },
    );
    expect(fs.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///storage/amy/amy-clip123.webm',
      'ZGF0YQ==',
      { encoding: 'base64' },
    );
    expect(warn).toHaveBeenCalledWith('Clip konnte nicht gespeichert werden', expect.any(Error));
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
        platform: androidPlatform,
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
        platform: androidPlatform,
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
        platform: androidPlatform,
      }),
    ).rejects.toEqual(new ClipCaptureError('clip_write_failed'));

    expect(warn).toHaveBeenCalledWith('Clip konnte nicht gespeichert werden', writeError);
  });

  it('returns specific user message for clip payload issues', () => {
    expect(getClipCaptureErrorMessage(new ClipCaptureError('clip_payload_invalid'))).toBe(
      'Videodaten waren ungültig. Bitte nimm die Geste erneut auf.',
    );
  });

  it('returns media recorder specific messaging when provided as string code', () => {
    expect(getClipCaptureErrorMessage('media_recorder_not_supported')).toBe(
      'Videoaufnahmen werden auf diesem Gerät nicht unterstützt. Amy speichert trotzdem deine Handbewegungen.',
    );
  });

  it('supports timeout errors bubbling up from the detector', () => {
    expect(getClipCaptureErrorMessage(new Error('clip_capture_timeout'))).toBe(
      'Die Videoaufnahme hat zu lange gedauert. Versuch es bitte erneut.',
    );
  });

  it('falls back to the default message for unknown errors', () => {
    expect(getClipCaptureErrorMessage(new Error('unexpected'))).toBe(DEFAULT_CLIP_CAPTURE_ERROR_MESSAGE);
  });

  it('detects network errors and provides specific message', () => {
    expect(getClipCaptureErrorMessage(new Error('Network request failed'))).toBe(
      'Netzwerkfehler beim Speichern des Videos. Prüfe deine Internetverbindung und versuch es erneut.'
    );
    expect(getClipCaptureErrorMessage(new Error('fetch failed'))).toBe(
      'Netzwerkfehler beim Speichern des Videos. Prüfe deine Internetverbindung und versuch es erneut.'
    );
    expect(getClipCaptureErrorMessage(new Error('connection error'))).toBe(
      'Netzwerkfehler beim Speichern des Videos. Prüfe deine Internetverbindung und versuch es erneut.'
    );
  });

  it('detects permission errors and provides specific message', () => {
    expect(getClipCaptureErrorMessage(new Error('Permission denied'))).toBe(
      'Zugriff verweigert. Prüfe die App-Berechtigungen und versuch es erneut.'
    );
    expect(getClipCaptureErrorMessage(new Error('Unauthorized access'))).toBe(
      'Zugriff verweigert. Prüfe die App-Berechtigungen und versuch es erneut.'
    );
  });

  it('detects storage errors and provides specific message', () => {
    expect(getClipCaptureErrorMessage(new Error('Not enough storage space'))).toBe(
      'Nicht genug Speicherplatz. Gib etwas Speicher frei und versuch es erneut.'
    );
    expect(getClipCaptureErrorMessage(new Error('Disk full'))).toBe(
      'Nicht genug Speicherplatz. Gib etwas Speicher frei und versuch es erneut.'
    );
  });

  it('detects timeout errors and uses predefined message', () => {
    expect(getClipCaptureErrorMessage(new Error('Operation timed out'))).toBe(
      'Die Videoaufnahme hat zu lange gedauert. Versuch es bitte erneut.'
    );
  });
});
