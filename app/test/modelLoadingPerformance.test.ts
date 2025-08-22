import { promises as fs } from 'fs';
import path from 'path';

describe('model loading performance', () => {
  it('WebView uses CDN-hosted Tasks Vision bundle', async () => {
    const detector = path.resolve(__dirname, '../src/components/MediaPipeGestureDetector.tsx');
    const content = await fs.readFile(detector, 'utf8');
    expect(content).toMatch(/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision\/vision_bundle\.js/);
    expect(content).toMatch(/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision\/wasm/);
    expect(content).toMatch(/storage\.googleapis\.com\/mediapipe-models\/gesture_recognizer/);
  });

  it('keeps dummy task bundling for compatibility', () => {
    expect(() => require('../assets/models/dummy.task')).not.toThrow();
  });
});
