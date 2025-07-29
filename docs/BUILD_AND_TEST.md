# Building and Testing Amy's Echo

This document outlines the process for building and testing the Amy's Echo application.

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
