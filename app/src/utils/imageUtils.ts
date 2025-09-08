export type Roi = { x: number; y: number; w: number; h: number } | null;

type ProcessOptions = {
  maxWidth?: number;
  maxHeight?: number;
  roi?: Roi;
  quality?: number; // 0..1
};

// Downscale and optionally crop a data URL (web only). Returns data URL.
export async function processDataUrl(
  dataUrl: string,
  { maxWidth = 448, maxHeight = 448, roi = null, quality = 0.8 }: ProcessOptions = {}
): Promise<string> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return dataUrl; // Non-web environments: no-op
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const sx = roi ? Math.max(0, Math.floor(roi.x)) : 0;
        const sy = roi ? Math.max(0, Math.floor(roi.y)) : 0;
        const sw = roi ? Math.max(1, Math.floor(roi.w)) : img.width;
        const sh = roi ? Math.max(1, Math.floor(roi.h)) : img.height;

        // Target size respecting aspect ratio
        const scale = Math.min(maxWidth / sw, maxHeight / sh, 1);
        const tw = Math.max(1, Math.floor(sw * scale));
        const th = Math.max(1, Math.floor(sh * scale));

        const canvas = document.createElement('canvas');
        canvas.width = tw;
        canvas.height = th;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);

        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, tw, th);
        const out = canvas.toDataURL('image/jpeg', Math.min(1, Math.max(0.1, quality)));
        resolve(out);
      } catch (e) {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Compute a bounding box in pixel space from normalized hand landmarks and frame size
export function computeHandRoi(
  landmarks: number[][][] | undefined,
  frameWidth: number,
  frameHeight: number,
  paddingRatio: number = 0.2
): Roi {
  if (!Array.isArray(landmarks) || landmarks.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const hand of landmarks) {
    if (!hand || hand.length === 0) continue;
    for (const p of hand) {
      const x = p[0] * frameWidth;
      const y = p[1] * frameHeight;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return null;
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  const padX = w * paddingRatio;
  const padY = h * paddingRatio;
  return {
    x: Math.max(0, Math.floor(minX - padX)),
    y: Math.max(0, Math.floor(minY - padY)),
    w: Math.min(frameWidth, Math.floor(w + 2 * padX)),
    h: Math.min(frameHeight, Math.floor(h + 2 * padY)),
  };
}
