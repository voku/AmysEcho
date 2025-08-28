import { OcclusionAssessment } from '../types';

// Simple occlusion heuristic: too few keypoints or bounding box near edges
export function assessOcclusion(landmarks: number[][], widthHint = 1, heightHint = 1): OcclusionAssessment {
  const hints: string[] = [];
  if (!landmarks || landmarks.length === 0) {
    return { occluded: true, hints: ['Zeige deine Hand deutlich vor die Kamera.'] };
  }
  const n = landmarks.length;
  if (n < 15) {
    hints.push('Bitte halte die gesamte Hand im Bild.');
  }
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const [x, y] of landmarks) {
    if (typeof x !== 'number' || typeof y !== 'number') continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  const margin = 0.05;
  if (minX < margin || minY < margin || maxX > 1 - margin || maxY > 1 - margin) {
    hints.push('Bewege die Hand in die Mitte des Bildes.');
  }

  return { occluded: hints.length > 0, hints };
}

