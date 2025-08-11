const { getDefaultConfig } = require('expo/metro-config');

// Ensure frame processor plugins like vision-camera-resize-plugin are available
require('vision-camera-resize-plugin');

const config = getDefaultConfig(__dirname);

// Include TFLite and MediaPipe Task model files in the bundle
config.resolver.assetExts.push('tflite', 'task');

module.exports = config;
