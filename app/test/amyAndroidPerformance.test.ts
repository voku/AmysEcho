import path from 'path';

// Performance targets
const TARGET_FPS = 20; // minimum acceptable average frames per second
const FRAME_COUNT = 30; // number of frames to sample

// Only run when explicit opt-in is provided. This avoids pulling in native
// modules during normal CI runs where an Android runtime is unavailable.
(process.env.ANDROID_PERF === '1' ? describe : describe.skip)(
  'Amy Android end-to-end performance',
  () => {
    it(
      'processes frames within 50ms inference budget',
      async () => {
        // Dynamic imports so that Jest on non-Android platforms doesn't try to
        // resolve native modules.
        const visionCamera = require('react-native-vision-camera') as any;
        const { loadTensorflowModel } = require('react-native-fast-tflite') as any;

        const device = await visionCamera.getCameraDevice('back');
        const modelPath = path.resolve(
          __dirname,
          '../assets/models/gesture_classifier.tflite',
        );
        const model = await loadTensorflowModel(modelPath);

        let totalInference = 0;
        const start = Date.now();

        for (let i = 0; i < FRAME_COUNT; i++) {
          // Capture a frame from the camera. On real devices this should return a
          // VisionCamera frame object. For the test runner this line will not be
          // executed unless running on an Android device.
          const frame = await visionCamera.takePhoto(device);

          // Run model inference and measure latency.
          const t0 = Date.now();
          await model.run([frame]);
          totalInference += Date.now() - t0;
        }

        const totalTime = Date.now() - start;
        const avgInference = totalInference / FRAME_COUNT;
        const avgFps = (FRAME_COUNT * 1000) / totalTime;

        expect(avgFps).toBeGreaterThanOrEqual(TARGET_FPS);
        expect(avgInference).toBeLessThan(50);
      },
      60000,
    );
  },
);
