const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Include TFLite and MediaPipe Task model files in the bundle
config.resolver.assetExts.push('tflite', 'task');
// Register frame processor plugin if available
let finalConfig = config;
try {
  const { withResizePlugin } = require('vision-camera-resize-plugin/metro');
  finalConfig = withResizePlugin(config);
} catch {
  // Helper not present; proceed with default config
}

module.exports = finalConfig;
