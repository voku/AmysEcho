import { mapToPreview } from '../src/utils/landmarkMapping';

test('mapToPreview centers content with letterboxing (wider preview)', () => {
  const lm: [number, number, number] = [0.5, 0.5, 0];
  const videoW = 1280;
  const videoH = 720; // 16:9
  const preview = { width: 1000, height: 500 }; // 2:1 preview, wider than 16:9
  const mirror = false;
  const p = mapToPreview(lm, videoW, videoH, preview, mirror);
  // x should be roughly center
  expect(p.x).toBeCloseTo(500, 1);
  // y should be centered within letterboxed area
  expect(p.y).toBeGreaterThan(0);
  expect(p.y).toBeLessThan(preview.height);
});

test('mapToPreview mirrors x when mirror=true', () => {
  const lm: [number, number, number] = [0.25, 0.5, 0];
  const videoW = 1280;
  const videoH = 720;
  const preview = { width: 720, height: 1280 }; // portrait, taller
  const pNo = mapToPreview(lm, videoW, videoH, preview, false);
  const pMi = mapToPreview(lm, videoW, videoH, preview, true);
  // mirrored x should reflect across content center; ensure not equal
  expect(pNo.x).not.toBeCloseTo(pMi.x, 5);
});

test('mapToPreview clamps to preview bounds', () => {
  // Intentionally pass slightly out-of-range coords due to numeric drift
  const lm: [number, number, number] = [1.001, -0.001, 0];
  const videoW = 1920;
  const videoH = 1080; // 16:9
  const preview = { width: 300, height: 600 }; // tall preview
  const p = mapToPreview(lm, videoW, videoH, preview, false);
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.y).toBeGreaterThanOrEqual(0);
  expect(p.x).toBeLessThanOrEqual(preview.width);
  expect(p.y).toBeLessThanOrEqual(preview.height);
});

test('mapToPreview centers content with letterboxing (taller preview)', () => {
  const lm: [number, number, number] = [0.5, 0.5, 0];
  const videoW = 1280;
  const videoH = 720; // 16:9
  const preview = { width: 720, height: 1280 }; // portrait
  const p = mapToPreview(lm, videoW, videoH, preview, false);
  // Expect roughly center of preview after accounting for letterbox
  expect(p.x).toBeGreaterThan(0);
  expect(p.x).toBeLessThan(preview.width);
  expect(p.y).toBeGreaterThan(0);
  expect(p.y).toBeLessThan(preview.height);
});
