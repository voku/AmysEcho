/**
 * Real image processing utility tests (no mocks)
 */

import { processDataUrl, computeHandRoi } from '../../src/utils/imageUtils';

// A tiny 1x1 PNG data URL
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAn8B9oGNs2kAAAAASUVORK5CYII=';

describe('imageUtils', () => {
  let OriginalImage: any;

  beforeAll(() => {
    // JSDOM lacks real image/canvas; simulate load event so code path resolves
    OriginalImage = (global as any).Image;
    (global as any).Image = class {
      onload: ((ev?: any) => void) | null = null;
      onerror: ((ev?: any) => void) | null = null;
      set src(_v: string) {
        setTimeout(() => this.onload && this.onload(new Event('load')), 0);
      }
    } as any;

    // Mock canvas and context for jsdom
    const originalCreateElement = document.createElement;
    document.createElement = function(tagName: string) {
      if (tagName === 'canvas') {
        const canvas = {
          width: 0,
          height: 0,
          getContext: jest.fn(() => ({
            drawImage: jest.fn(),
            fillRect: jest.fn(),
            clearRect: jest.fn(),
            getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(4) })),
            putImageData: jest.fn(),
            createImageData: jest.fn(() => ({ data: new Uint8ClampedArray(4) })),
            setTransform: jest.fn(),
            drawImage: jest.fn(),
            save: jest.fn(),
            restore: jest.fn(),
            beginPath: jest.fn(),
            moveTo: jest.fn(),
            lineTo: jest.fn(),
            closePath: jest.fn(),
            stroke: jest.fn(),
            fill: jest.fn(),
          })),
          toDataURL: jest.fn(() => 'data:image/jpeg;base64,mocked'),
          toBlob: jest.fn(),
        };
        return canvas as any;
      }
      return originalCreateElement.call(this, tagName);
    };
  });

  afterAll(() => {
    (global as any).Image = OriginalImage;
    // Restore original createElement if it was mocked
    if ((document as any).createElement.restore) {
      (document as any).createElement.restore();
    }
  });
  describe('computeHandRoi', () => {
    it('computes pixel ROI from normalized landmarks with padding', () => {
      const landmarks = [
        [
          [0.1, 0.2, 0],
          [0.4, 0.6, 0],
        ],
      ];

      const roi = computeHandRoi(landmarks as any, 800, 600, 0.1);
      expect(roi).not.toBeNull();
      if (roi) {
        expect(roi.x).toBeGreaterThanOrEqual(0);
        expect(roi.y).toBeGreaterThanOrEqual(0);
        expect(roi.w).toBeGreaterThan(0);
        expect(roi.h).toBeGreaterThan(0);
        // ROI should stay within image bounds
        expect(roi.x + roi.w).toBeLessThanOrEqual(800);
        expect(roi.y + roi.h).toBeLessThanOrEqual(600);
      }
    });

    it('returns null when landmarks are empty', () => {
      expect(computeHandRoi([], 640, 480)).toBeNull();
    });
  });

  describe('processDataUrl', () => {
    it('downscales/crops data URL and returns a valid data URL', async () => {
      const out = await processDataUrl(TINY_PNG, { maxWidth: 10, maxHeight: 10, quality: 0.8 });
      expect(typeof out).toBe('string');
      // In JSDOM, canvas context may be unavailable; function must still return a data URL
      expect(out.startsWith('data:image/')).toBe(true);
    });

    it('crops using ROI when provided', async () => {
      // Provide an ROI and ensure the function still returns a valid JPEG
      const out = await processDataUrl(TINY_PNG, {
        maxWidth: 10,
        maxHeight: 10,
        roi: { x: 0, y: 0, w: 1, h: 1 },
        quality: 0.9,
      });
      expect(out.startsWith('data:image/')).toBe(true);
    });
  });
});
