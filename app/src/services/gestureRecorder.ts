import type { TrainingFrame } from '../storage';

const NO_LANDMARKS_ERROR = 'Ich sehe dich noch nicht. Beweg deine Hand ein bisschen!';

export async function captureSamples(
  getFrame: () => { landmarks: number[][][]; handedness: string[] },
  durationMs = 2000,
  intervalMs = 66,
): Promise<TrainingFrame[]> {
  const frames: TrainingFrame[] = [];
  const start = Date.now();
  while (Date.now() - start < durationMs) {
    const { landmarks, handedness } = getFrame();
    if (landmarks.length > 0 && landmarks.every((h) => h.length === 21)) {
      const clone = landmarks.map((hand) => hand.map((pt) => [...pt]));
      frames.push({ landmarks: clone, handedness: [...handedness] });
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  if (frames.length === 0) throw new Error(NO_LANDMARKS_ERROR);
  return frames;
}
