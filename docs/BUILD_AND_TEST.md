# Building and Testing Amy's Echo

This document outlines the process for building and testing the Amy's Echo application.

If you're developing on Windows via WSL2, see [Android development with WSL2](AndroidWSL2.md) for connecting a physical device.

## Building the App

The application is built using Expo. To build the Android app, run the following command from the `app` directory:

```bash
npm run android
```

**Important:** Before running the build command, ensure that you have a connected Android device or a running emulator. If no device is found, the build process will fail.

### Troubleshooting

*   **Build fails with `No Android connected device found`:** This error occurs when there are no connected Android devices or running emulators. To resolve this, connect a device or start an emulator and try again.
*   **Installation fails:** If the build is successful but the installation fails, it might be due to issues with the Android Debug Bridge (ADB). You can check the list of connected devices using `adb devices`.

## Testing the App

The application has a suite of tests that can be run to verify the core logic. To run the tests, use the following command from the `app` directory:

```bash
npm test
```

If all tests pass, you should see a success message in the console. This indicates that the core functionality of the application is working as expected.

## Integration Tests

Integration tests verify that the Node server and app API clients work together correctly. From the repository root run:

```bash
npm test --prefix integration
```

The tests will build the server and exercise key endpoints. They are also executed by `./scripts/full-check.sh`.

## Expo dependency checks

Before attempting a native build, verify that your Expo packages match the installed SDK. The `./scripts/full-check.sh` helper now runs these checks automatically, but you can also execute them manually:

```bash
(cd app && npx expo install --check)
(cd app && npx expo-doctor)
```

`expo install --check` ensures dependencies are aligned with the Expo SDK while `expo-doctor` validates the project configuration.

## Building APKs with EAS

Amy's Echo relies on Expo's **EAS Build** service. Two build profiles are available in `app/eas.json`.

### Development build (testing APK)

Use this to produce a debuggable APK for internal testing:

1. Run the full test suite to verify everything is green:
   ```bash
   ./scripts/full-check.sh
   ```
2. Generate the native Android project if it doesn't already exist:
   ```bash
   npx expo prebuild --platform android
   ```
3. Trigger the remote build from the `app` directory:
   ```bash
   npm run build:android-dev
   ```
   The command prints a link where you can download the APK. You can also fetch the latest build later:
   ```bash
   eas build:download --platform android --profile development --latest
   ```

After installing the APK on a device, start the bundler with `npx expo start` to load the JavaScript bundle.

This development build packages a custom Expo dev client. It does **not** contain the compiled app – the JavaScript bundle is loaded over the network. For a self-contained APK that runs offline see the next section.

### Installable test APK (no bundler)

To sideload the full app without the Expo dev client:

1. Ensure tests pass and native projects exist as above.
2. Trigger a production build that outputs an APK instead of an Android App Bundle:
   ```bash
   npm run build:android-apk
   ```
   The resulting file contains the compiled JavaScript bundle and assets, so it can run without `expo start`.

### Production build (Play Store)

For store-ready binaries the recommended workflow is:

1. Run the full test suite to verify everything is green:
   ```bash
   ./scripts/full-check.sh
   ```
2. Generate the native Android project if it doesn't already exist:
   ```bash
   npx expo prebuild --platform android
   ```
3. Trigger the remote build from the `app` directory:
   ```bash
   npm run build:android
   ```
   The command prints a link where you can monitor progress. You can also query the latest build using:
   ```bash
   eas build:list --limit 1
   ```
Ensure you are logged in to Expo (`npx expo whoami`) or provide an `EXPO_TOKEN` when running in CI.

The Expo checks above are executed automatically by `./scripts/full-check.sh`, but you can rerun them manually when debugging build issues:

```bash
(cd app && npx expo install --check)
(cd app && npx expo-doctor)    # skips WatermelonDB packages via package.json
```
