import {
  captureFrameForTrainer,
  frameCaptureState,
  getLastCapturedFrame,
  setFrameCaptureEnabled,
} from './FrameCaptureManager';

const DEFAULT_FRAME_INTERVAL_MS = 120;
const MAX_CAPTURE_FRAMES = 180;
const MIN_FPS = 6;
const MAX_FPS = 24;

export type FallbackClipResult = {
  base64: string;
  mimeType: string;
  durationMs: number;
  frameCount: number;
  capturedAt: string;
};

type RecorderOptions = {
  frameIntervalMs?: number;
  maxFrames?: number;
  mimeType?: string;
};

export class FallbackClipRecorder {
  private readonly frameIntervalMs: number;
  private readonly maxFrames: number;
  private readonly mimeType: string;
  private startedAt = 0;
  private frames: Uint8Array[] = [];
  private timer: number | null = null;
  private cancelled = false;
  private width = 0;
  private height = 0;
  private lastCapturedBase64: string | null = null;
  private readonly previousCaptureState = {
    enabled: frameCaptureState.frameCaptureEnabled,
    interval: frameCaptureState.frameCaptureInterval,
  };

  constructor(private readonly video: HTMLVideoElement, options: RecorderOptions = {}) {
    this.frameIntervalMs = Math.max(60, options.frameIntervalMs ?? DEFAULT_FRAME_INTERVAL_MS);
    this.maxFrames = Math.max(10, options.maxFrames ?? MAX_CAPTURE_FRAMES);
    this.mimeType = options.mimeType ?? 'video/avi';
  }

  start(): void {
    if (!this.video) {
      throw new Error('fallback_video_unavailable');
    }

    const width = Math.max(1, this.video.videoWidth || 0);
    const height = Math.max(1, this.video.videoHeight || 0);

    if (!width || !height) {
      throw new Error('fallback_video_not_ready');
    }

    this.width = width;
    this.height = height;
    this.startedAt = Date.now();
    this.cancelled = false;
    this.frames = [];

    const previousInterval = this.previousCaptureState.interval;
    const desiredInterval =
      typeof previousInterval === 'number' && previousInterval > 0
        ? Math.min(previousInterval, this.frameIntervalMs)
        : this.frameIntervalMs;
    setFrameCaptureEnabled(true, desiredInterval);

    this.captureFrame();
    if (this.timer !== null) {
      clearInterval(this.timer);
    }
    this.timer = window.setInterval(() => this.captureFrame(), this.frameIntervalMs);
  }

  async stop(): Promise<FallbackClipResult> {
    if (!this.startedAt) {
      throw new Error('fallback_not_started');
    }

    this.clearTimer();

    if (this.frames.length === 0) {
      this.restoreCaptureState();
      throw new Error('fallback_no_frames');
    }

    try {
      const fps = this.computeFps();
      const encoder = new MjpegAviEncoder(this.width, this.height, fps);
      for (const frame of this.frames) {
        encoder.addFrame(frame);
      }

      const aviBytes = encoder.build();
      const base64 = uint8ArrayToBase64(aviBytes);
      const durationMs = Math.max(
        Date.now() - this.startedAt,
        Math.round((this.frames.length / fps) * 1000),
      );

      return {
        base64,
        mimeType: this.mimeType,
        durationMs,
        frameCount: this.frames.length,
        capturedAt: new Date(this.startedAt).toISOString(),
      };
    } finally {
      this.restoreCaptureState();
    }
  }

  cancel(): void {
    this.cancelled = true;
    this.clearTimer();
    this.frames = [];
    this.restoreCaptureState();
  }

  getMimeType(): string {
    return this.mimeType;
  }

  private computeFps(): number {
    const estimated = Math.round(1000 / this.frameIntervalMs);
    return Math.max(MIN_FPS, Math.min(MAX_FPS, estimated || MIN_FPS));
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private restoreCaptureState(): void {
    setFrameCaptureEnabled(this.previousCaptureState.enabled, this.previousCaptureState.interval);
  }

  private captureFrame(): void {
    if (this.cancelled) {
      return;
    }

    try {
      if (this.frames.length >= this.maxFrames) {
        this.clearTimer();
        return;
      }

      const dataUrl = captureFrameForTrainer(this.video) ?? getLastCapturedFrame();
      if (!dataUrl) {
        return;
      }

      const base64 = extractBase64(dataUrl);
      if (!base64 || base64 === this.lastCapturedBase64) {
        return;
      }

      this.lastCapturedBase64 = base64;
      const bytes = base64ToUint8Array(base64);
      if (bytes.length === 0) {
        return;
      }

      this.frames.push(bytes);
    } catch (error) {
      console.warn('FallbackClipRecorder capture failed:', error);
    }
  }
}

// AVI header structure constants
const AVIH_CHUNK_SIZE = 56;
const STRH_CHUNK_SIZE = 56;
const STRF_CHUNK_SIZE = 40;
const AVIF_HAS_INDEX = 0x10;
const AVI_KEYFRAME = 0x10;

class MjpegAviEncoder {
  private readonly frames: Uint8Array[] = [];
  private readonly chunkSizes: number[] = [];
  private readonly frameOffsets: number[] = [];
  private totalSize = 0;

  constructor(private readonly width: number, private readonly height: number, private readonly fps: number) {}

  addFrame(frame: Uint8Array): void {
    const paddedLength = frame.length + (frame.length % 2);
    this.frames.push(frame);
    this.chunkSizes.push(frame.length);
    this.frameOffsets.push(this.totalSize);
    this.totalSize += 8 + paddedLength; // chunk header + data (+padding)
  }

  build(): Uint8Array {
    const frameCount = this.frames.length;
    if (frameCount === 0) {
      throw new Error('mjpeg_encoder_empty');
    }

    const frameBlockSize = this.totalSize;
    const idx1Size = 16 * frameCount;

    const avihChunkSize = 8 + AVIH_CHUNK_SIZE;
    const strhChunkSize = 8 + STRH_CHUNK_SIZE;
    const strfChunkSize = 8 + STRF_CHUNK_SIZE;
    const strlListSize = 12 + strhChunkSize + strfChunkSize;
    const hdrlListSize = 12 + avihChunkSize + strlListSize;
    const moviListSize = 12 + frameBlockSize;
    const idx1ChunkSize = 8 + idx1Size;

    const totalSize = 12 + hdrlListSize + moviListSize + idx1ChunkSize;
    const riffSize = totalSize - 8;

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let offset = 0;

    // Helper to write ascii
    const writeFourCC = (value: string) => {
      for (let i = 0; i < 4; i++) {
        bytes[offset + i] = value.charCodeAt(i) & 0xff;
      }
      offset += 4;
    };

    const writeUint32 = (value: number) => {
      view.setUint32(offset, value, true);
      offset += 4;
    };

    const writeUint16 = (value: number) => {
      view.setUint16(offset, value, true);
      offset += 2;
    };

    // RIFF header
    writeFourCC('RIFF');
    writeUint32(riffSize);
    writeFourCC('AVI ');

    // LIST hdrl
    writeFourCC('LIST');
    writeUint32(hdrlListSize - 8); // size of 'hdrl' chunk contents
    writeFourCC('hdrl');

    // avih chunk
    writeFourCC('avih');
    writeUint32(AVIH_CHUNK_SIZE);
    writeUint32(Math.round(1_000_000 / this.fps)); // dwMicroSecPerFrame
    writeUint32(this.averageBytesPerSecond());
    writeUint32(0); // dwPaddingGranularity
    writeUint32(AVIF_HAS_INDEX); // dwFlags (HAS_INDEX)
    writeUint32(frameCount);
    writeUint32(0); // dwInitialFrames
    writeUint32(1); // dwStreams
    writeUint32(this.maxFrameSize()); // dwSuggestedBufferSize
    writeUint32(this.width);
    writeUint32(this.height);
    writeUint32(0); // dwReserved[0]
    writeUint32(0); // dwReserved[1]
    writeUint32(0); // dwReserved[2]
    writeUint32(0); // dwReserved[3]

    // LIST strl
    writeFourCC('LIST');
    writeUint32(strlListSize - 8);
    writeFourCC('strl');

    // strh chunk
    writeFourCC('strh');
    writeUint32(STRH_CHUNK_SIZE);
    writeFourCC('vids');
    writeFourCC('MJPG');
    writeUint32(0); // dwFlags
    writeUint16(0); // wPriority
    writeUint16(0); // wLanguage
    writeUint32(0); // dwInitialFrames
    writeUint32(1); // dwScale
    writeUint32(this.fps); // dwRate
    writeUint32(0); // dwStart
    writeUint32(frameCount);
    writeUint32(this.maxFrameSize()); // dwSuggestedBufferSize
    writeUint32(0); // dwQuality
    writeUint32(0); // dwSampleSize
    writeUint16(0);
    writeUint16(0);

    // strf chunk (BITMAPINFOHEADER)
    writeFourCC('strf');
    writeUint32(STRF_CHUNK_SIZE);
    writeUint32(STRF_CHUNK_SIZE); // biSize
    writeUint32(this.width);
    writeUint32(this.height);
    writeUint16(1); // biPlanes
    writeUint16(24); // biBitCount
    writeFourCC('MJPG');
    writeUint32(this.maxFrameSize()); // biSizeImage
    writeUint32(0); // biXPelsPerMeter
    writeUint32(0); // biYPelsPerMeter
    writeUint32(0); // biClrUsed
    writeUint32(0); // biClrImportant

    // LIST movi
    writeFourCC('LIST');
    writeUint32(frameBlockSize + 4);
    writeFourCC('movi');

    for (let index = 0; index < frameCount; index++) {
      const frame = this.frames[index];
      if (!frame) continue;
      const size = frame.length;
      writeFourCC('00db');
      writeUint32(size);
      bytes.set(frame, offset);
      offset += size;
      if (size % 2 === 1) {
        bytes[offset] = 0;
        offset += 1;
      }
    }

    // idx1 chunk
    writeFourCC('idx1');
    writeUint32(idx1Size);

    // The 'idx1' chunk contains offsets relative to the start of the 'movi' LIST chunk.
    // The 'movi' LIST chunk has a 12-byte header ('LIST', size, 'movi') before the frame data.
    const idx1OffsetFromMoviListStart = 12;
    for (let index = 0; index < frameCount; index++) {
      const frameOffset = this.frameOffsets[index];
      const chunkSize = this.chunkSizes[index];
      if (frameOffset === undefined || chunkSize === undefined) continue;
      writeFourCC('00db');
      writeUint32(AVI_KEYFRAME); // keyframe
      writeUint32(frameOffset + idx1OffsetFromMoviListStart);
      writeUint32(chunkSize);
    }

    return new Uint8Array(buffer);
  }

  private averageBytesPerSecond(): number {
    const total = this.chunkSizes.reduce((sum, value) => sum + value, 0);
    return Math.max(1, Math.round(total * this.fps / Math.max(1, this.frames.length)));
  }

  private maxFrameSize(): number {
    return this.chunkSizes.reduce((max, value) => Math.max(max, value), 0);
  }
}

function extractBase64(dataUrl: string): string | null {
  if (typeof dataUrl !== 'string') {
    return null;
  }
  const commaIndex = dataUrl.indexOf(',');
  const payload = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  return payload && payload.trim().length > 0 ? payload.trim() : null;
}

function base64ToUint8Array(base64: string): Uint8Array {
  try {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (error) {
    console.warn('Failed to decode base64 frame', error);
    return new Uint8Array();
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(bytes.length, i + chunk));
    binary += String.fromCharCode(...(slice as unknown as number[]));
  }
  return btoa(binary);
}
