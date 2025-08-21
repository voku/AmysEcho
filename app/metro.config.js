const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Include TFLite and MediaPipe Task model files in the bundle
config.resolver.assetExts.push('tflite', 'task');
module.exports = config;
