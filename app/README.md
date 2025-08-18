# Amy's Echo

This is the mobile application for Amy's Echo, a multimodal communication platform for non-verbal children. The app uses a hybrid approach: reliable server-side detection/recognition by default, with on-device fallback when offline.

## Getting Started

### Prerequisites

- Node.js (LTS)
- Yarn or npm
- An Android or iOS simulator/device

### Installation

1.  Install dependencies:
    ```bash
    npm install
    ```

### Running the App

-   **To run on Android:**
    ```bash
    npm run android
    ```
-   **To run on iOS:**
    ```bash
    npm run ios
    ```

## Troubleshooting

### `.tflite` files not found

If you encounter an error where the `.tflite` model files are not found, you may need to create a `metro.config.js` file in the `app` directory with the following content:

```javascript
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('tflite');

module.exports = config;
```

This will ensure that the Metro bundler includes the `.tflite` files in the build.
