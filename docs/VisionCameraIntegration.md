# VisionCamera Integration

This document summarizes key points from the official [`react-native-vision-camera`](https://github.com/mrousavy/react-native-vision-camera) and [`vision-camera-resize-plugin`](https://github.com/mrousavy/vision-camera-resize-plugin) documentation and how they map to our implementation.

## Library Overview
- **VisionCamera** provides high-performance camera access and a Frame Processor API for running JS worklets on frames.
- **vision-camera-resize-plugin** is a Frame Processor plugin that converts camera frames to RGB buffers with optional resize, crop, rotation and data-type conversion.

## Installation Notes
- Both packages require the React Native worklets runtime and must be linked in native builds.
- The resize plugin must be registered with Metro using `withResizePlugin`.
- At runtime the plugin is available through `VisionCameraProxy.initFrameProcessorPlugin('resize')`.

## Usage Patterns
- Inside React components use `useResizePlugin` to obtain a `resize` function.
- For non-component worklets, `createResizePlugin` can initialize the plugin once and reuse it.
- The plugin accepts options for `scale`, `pixelFormat` and `dataType` (`uint8` or `float32`).

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
- `app/src/services/landmarkExtractor.ts` falls back to `ArrayBuffer` processing when `VisionCameraProxy` is missing, logging a warning to aid debugging.
- Both code paths match the APIs described in the official docs and use the same option names (`scale`, `pixelFormat`, `dataType`).

## Troubleshooting
- If logs show `VisionCameraProxy not found; using ArrayBuffer fallback` the native plugin was not loaded; ensure the dependency is installed and the build picked up the `withResizePlugin` metro config.
- For Expo, run `expo prebuild` or `eas build` after installing native dependencies.

