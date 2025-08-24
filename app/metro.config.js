const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Include MediaPipe Task model files in the bundle
config.resolver.assetExts.push('task');
module.exports = config;
