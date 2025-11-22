# WebView recording support check

## Dependency alignment
- Updated Expo runtime packages to the latest patch levels expected by our toolchain:
  - `expo` to `~54.0.25`
  - `expo-asset` to `~12.0.10`
  - `expo-file-system` to `~19.0.19`

## Upstream WebView status
- A GitHub search for open `MediaRecorder` issues in `react-native-webview` returned no results, suggesting there is no currently tracked gap for that API in the upstream package.
- The latest open issues in `react-native-webview` focus on unrelated areas (e.g., `hasGesture` metadata in load requests and orientation/motion permission handling), not on media capture APIs.
- Historical context: issue [#2201](https://github.com/react-native-webview/react-native-webview/issues/2201) reported `MediaRecorder` permission errors on Android/iOS but was closed as stale after community replies confirmed adding explicit microphone/audio permissions to the native manifests resolved the problem.
- Our Expo config already declares microphone usage descriptions for iOS and enables `recordAudioAndroid` via the `expo-camera` plugin, so the permission requirements from #2201 are covered in the current app setup.

## Next steps
- If recording failures persist after the dependency updates, capture the WebView console logs and `clip_error` telemetry so we can correlate them with device-specific Chromium builds. No upstream blockers are visible right now.
