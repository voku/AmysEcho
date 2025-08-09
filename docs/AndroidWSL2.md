Android / WSL2 Development Flow
================================

Reliable USB debugging and builds from WSL2 for Android devices.

Prerequisites
- Windows 11 with WSL2 (Ubuntu recommended)
- Android device with Developer Options + USB debugging enabled
- Windows: `usbipd-win` installed (winget install usbipd)
- Windows: Android Platform Tools (`adb`) installed or via Android Studio

Steps
1) On Windows PowerShell (Admin):
   - List USB devices: `usbipd wsl list`
   - Bind your phone by BUSID: `usbipd wsl attach --busid <BUSID> --distribution <YourDistro>`
   - Verify: `usbipd wsl list`

2) Inside WSL2:
   - Ensure `adb` is available (install platform-tools or alias Windows adb)
   - Check device: `adb devices`
   - If unauthorized, accept the prompt on the device.

3) Expo / Dev Client
   - For development builds: `npm run android --prefix app` or `eas build --local`
   - For dev client: `npm run build:android-dev --prefix app`

4) Troubleshooting
   - If `adb devices` is empty: reattach with usbipd and ensure Windows Defender isn’t blocking.
   - If Expo can’t see the device: restart `adb` server: `adb kill-server && adb start-server`
   - For networking from device to WSL: ensure `adb reverse tcp:8081 tcp:8081` for Metro bundler.

