export async function captureSamples(
  getLandmarks: () => number[][][],
  durationMs = 2000,
  intervalMs = 66,
): Promise<number[][][][]> {
  const frames: number[][][][] = [];
  const start = Date.now();
  while (Date.now() - start < durationMs) {
    const lms = getLandmarks();
    if (lms.length > 0 && lms.every((h) => h.length === 21)) {
      const clone = lms.map((hand) => hand.map((pt) => [...pt]));
      frames.push(clone);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  if (frames.length === 0) throw new Error('Keine Landmarken erfasst');
  return frames;
}
