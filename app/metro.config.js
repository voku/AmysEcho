const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Include TFLite and MediaPipe Task model files in the bundle
config.resolver.assetExts.push('tflite', 'task');
// Register frame processor plugin if available
let finalConfig = config;
try {
  const { withResizePlugin } = require('vision-camera-resize-plugin/metro');
  // Chain wrappers to keep this composable
  finalConfig = withResizePlugin(finalConfig);
} catch (e) {
  // Only swallow missing-module errors; log others once for visibility
  if (!e || e.code !== 'MODULE_NOT_FOUND') {
    console.warn(
      'vision-camera-resize-plugin failed to load:',
      e?.message ?? e,
    );
  }
  // Proceed with default config
}

module.exports = finalConfig;
