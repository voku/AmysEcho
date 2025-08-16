export type PreviewRect = { width: number; height: number };

/**
 * Maps a normalized landmark (x,y in [0,1], z preserved) from camera space
 * to the preview rectangle coordinates considering aspect-fit letterboxing
 * and optional mirroring for front camera.
 */
export function mapToPreview(
  lm: readonly [number, number, number],
  videoWidth: number,
  videoHeight: number,
  preview: PreviewRect,
  mirror: boolean,
): { x: number; y: number } {
  const formatRatio = videoWidth / videoHeight;
  const screenRatio = preview.width / preview.height;

  let contentWidth = preview.width;
  let contentHeight = preview.height;
  let offsetX = 0;
  let offsetY = 0;

  if (screenRatio > formatRatio) {
    // Preview is wider than content, height is letterboxed
    contentHeight = preview.width / formatRatio;
    offsetY = (preview.height - contentHeight) / 2;
  } else {
    // Preview is taller than content, width is letterboxed
    contentWidth = preview.height * formatRatio;
    offsetX = (preview.width - contentWidth) / 2;
  }

  const xNorm = mirror ? 1 - lm[0] : lm[0];
  const yNorm = lm[1];

  const x = offsetX + xNorm * contentWidth;
  const y = offsetY + yNorm * contentHeight;
  return { x, y };
}

