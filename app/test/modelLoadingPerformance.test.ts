import { promises as fs } from 'fs';
import path from 'path';

describe('model loading performance', () => {
  it('WebView uses CDN-hosted Tasks Vision bundle', async () => {
    const script = path.resolve(__dirname, '../assets/gestureDetector.js');
    const content = await fs.readFile(script, 'utf8');
    expect(content).toMatch(/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision\/vision_bundle\.(?:cjs|mjs|js)/);
    expect(content).toMatch(/cdn\.jsdelivr\.net\/npm\/@mediapipe\/tasks-vision\/wasm/);
    expect(content).toMatch(/storage\.googleapis\.com\/mediapipe-models\/gesture_recognizer/);
  });

  it('keeps dummy task bundling for compatibility', () => {
    expect(() => require('../assets/models/dummy.task')).not.toThrow();
  });
});
