import { promises as fs } from 'fs';
import path from 'path';

describe('model loading performance', () => {
  it('WebView uses locally hosted Tasks Vision bundle', async () => {
    const detector = path.resolve(__dirname, '../src/components/MediaPipeGestureDetector.tsx');
    const content = await fs.readFile(detector, 'utf8');
    expect(content).toMatch(/static\/mediapipe\/tasks-vision\/0\.10\.9\/vision_bundle\.mjs/);
    expect(content).toMatch(/static\/mediapipe\/tasks-vision\/0\.10\.9\/wasm/);
    expect(content).toMatch(/static\/models\/gesture_recognizer\.task/);
  });

  it('keeps dummy task bundling for compatibility', () => {
    expect(() => require('../assets/models/dummy.task')).not.toThrow();
  });
});
