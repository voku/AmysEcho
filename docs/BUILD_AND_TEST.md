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

### Coordinating timer modes in unit tests

`AppServicesProvider` exercises asynchronous queues that occasionally rely on `jest.useFakeTimers()`. Tests use the shared `flushAsync` helper (see `app/test/appServicesProvider.test.tsx`) to advance pending work deterministically. Pass `flush: { timerMode: 'fake' }` whenever a test switches to fake timers so the helper advances mocked timers instead of awaiting the real clock. Real timer tests can call `expectEventually` without options and the helper will default to real-time progression. This explicit timer mode contract keeps the GitHub Actions CI (which runs `npm test --prefix app -- --watchAll=false`) stable and documents why the helper accepts a timer mode flag.

## Testing the Server

The backend relies on both Jest (TypeScript) and Pytest (Python). Make sure Node.js 18 or newer is installed so the compiled server bundle is available to the Python suite. Before running the Python tests, compile the TypeScript sources so `dist/server.js` and helper modules exist:

```bash
npm run build --prefix server
```

Running `npm test --prefix server` automatically builds the server before invoking Pytest, so the manual build step is only necessary when executing `npm run test:py --prefix server` directly.

## Running the Server and App

To exercise the full training and recognition flow, start both the Node server and the Expo client from the repository root:

```bash
# build and launch the backend on port 5000 with the demo token
npm run build --prefix server
API_TOKEN=demo-token npm start --prefix server

# in another terminal, start the mobile app
EXPO_PUBLIC_API_URL=http://10.0.2.2:5000 ./scripts/dev-run.sh --android
```

When running on a physical device instead of the Android emulator, you can map the server port with:

```bash
scripts/adb-reverse.sh 5000 && EXPO_PUBLIC_API_URL=http://localhost:5000 ./scripts/dev-run.sh --android
```

The server defaults to port `5000`. `scripts/dev-run.sh` wraps Expo's development launcher, so you can pass `--android` or `--ios` to target the appropriate platform.

### Supplying the OpenAI API key

OpenAI validation is disabled until the server (and optional integration tests) receive an API key. You can provide it in one of three ways:

- Export an environment variable before starting any processes that use OpenAI:
  ```bash
  export OPENAI_API_KEY="sk-your-key"
  npm start --prefix server
  ```
- Create a `.openai-key` file at the repository root that contains only the key. The server reads this file automatically when the environment variable is missing.
- Enter the key once through the mobile app's Admin screen; it is stored securely on the device via Expo `SecureStore`.

For CI or production environments prefer secret managers or environment variables so the key never touches source control.

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

### Prerequisites

Before kicking off any remote build:

1. **Authenticate with Expo**
   ```bash
   npx expo login        # or set EXPO_TOKEN for CI usage
   npx expo whoami       # verify you are logged in
   ```
2. **Verify the project configuration** (requires network access)
   ```bash
   (cd app && npx expo install --check)
   (cd app && npx expo-doctor)
   ```
3. **Prepare for non-interactive logs** – prefix build commands with `CI=1` to disable spinners. If fingerprinting stalls, add `EAS_SKIP_AUTO_FINGERPRINT=1`.

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
   CI=1 npm run build:android-dev
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
   CI=1 npm run build:android-apk
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
   CI=1 npm run build:android
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
