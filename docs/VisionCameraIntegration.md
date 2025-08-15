# VisionCamera Integration

This document summarizes key points from the official [`react-native-vision-camera`](https://github.com/mrousavy/react-native-vision-camera) and [`vision-camera-resize-plugin`](https://github.com/mrousavy/vision-camera-resize-plugin) documentation and how they map to our implementation.

## Library Overview
- **VisionCamera** provides high-performance camera access and a Frame Processor API for running JS worklets on frames.
- **vision-camera-resize-plugin** is a Frame Processor plugin that converts camera frames to RGB buffers with optional resize, crop, rotation and data-type conversion.

## Installation Notes
- Both packages rely on `react-native-worklets-core`. Ensure it is installed and the Worklets Babel plugin is enabled (usually by adding `react-native-worklets-core/plugin` to `babel.config.js`).
- Register the resize plugin in Metro by wrapping your config with `withResizePlugin`:

  ```js
  // app/metro.config.js
  const { getDefaultConfig } = require('@react-native/metro-config');
  const { withResizePlugin } = require('vision-camera-resize-plugin/metro');
  const config = getDefaultConfig(__dirname);
  module.exports = withResizePlugin(config);
  ```
- At runtime, initialize the plugin from a frame-processor worklet using `VisionCameraProxy.initFrameProcessorPlugin('resize')`.
- For non-component worklets, the plugin is initialized via `createResizePlugin()`.

## Usage Patterns
- Inside React components, use the `useResizePlugin` hook to obtain a `resize` function.
- The initialized plugin instance can then be used to `resize` frames in non-component worklets.
- The plugin accepts options for `scale`, `pixelFormat`, and `dataType` (`uint8` or `float32`). See the upstream plugin's README for the full list of supported options and defaults.

## Example

Below is a simplified Frame Processor that resizes each camera frame to `320x320` RGB bytes and feeds it into a TensorFlow Lite model:

```tsx
const objectDetection = useTensorflowModel(require('assets/efficientdet.tflite'))
const model = objectDetection.state === 'loaded' ? objectDetection.model : undefined

const { resize } = useResizePlugin()

const frameProcessor = useFrameProcessor((frame) => {
  'worklet'

  const data = resize(frame, {
    scale: { width: 320, height: 320 },
    pixelFormat: 'rgb',
    dataType: 'uint8',
  })
  const output = model.runSync([data])

  const numDetections = output[0]
  console.log(`Detected ${numDetections} objects!`)
}, [model])
```

## Alignment With Our Code
- `app/metro.config.js` registers the plugin via `withResizePlugin`.
- `app/src/ml/tfliteRuntime.ts` uses `useResizePlugin` to feed resized RGB frames directly into TensorFlow Lite.
- `app/src/services/landmarkExtractor.ts` falls back to `ArrayBuffer` processing when `VisionCameraProxy` is missing, logging a warning to aid in debugging.
- Both code paths match the APIs described in the official docs and use the same option names (`scale`, `pixelFormat`, `dataType`).

## Troubleshooting
- If logs show `VisionCameraProxy not found; using ArrayBuffer fallback`, the native plugin was not loaded; ensure the dependency is installed and the build picked up the `withResizePlugin` Metro config.
- For Expo, run `expo prebuild` (or use `eas build`) after installing native dependencies. Frame Processors are not supported in Expo Go; use a development build.
- After changing Metro/Babel config, rebuild the native app and clear caches:
  - iOS (bare RN): `cd ios && pod install`
  - Clear Metro cache: `rm -rf $TMPDIR/metro-* && rm -rf node_modules/.cache/metro`
  - Restart bundler with `--reset-cache`

