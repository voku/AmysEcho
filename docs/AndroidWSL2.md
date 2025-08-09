# Android Development with WSL2

This guide provides instructions for setting up a reliable Android development environment using WSL2 and a physical Android device.

## Prerequisites

- Windows 11 with WSL2 installed.
- A physical Android device with Developer Mode and USB Debugging enabled.
- A USB cable to connect your Android device to your computer.
- Expo + React Native CLI environment set up inside WSL2.

## 1. Install ADB and USB tools inside WSL2

```bash
sudo apt update
sudo apt install android-tools-adb usbutils
```

## 2. Install `usbipd-win`

`usbipd-win` is a tool that allows you to share USB devices from Windows to WSL2. You can install it using `winget`:

```bash
winget install --interactive --exact dorssel.usbipd-win
```

## 3. Attach your Android device to WSL2

1. Connect your Android device to your computer via USB.
2. Open a PowerShell terminal with administrator privileges.
3. List the available USB devices:

    ```powershell
    usbipd list
    ```

4. Find your Android device in the list and note its BUSID.
5. Attach the device to WSL2, replacing `<BUSID>` with the value from the list:

    ```powershell
    usbipd attach --busid <BUSID> --wsl
    ```

## 4. Verify the device is connected to WSL2

1. Open a terminal in your WSL2 distribution.
2. Run the following commands:

    ```bash
    lsusb
    adb devices
    ```

    If the device shows as `unauthorized`, unlock your phone and confirm the USB debugging prompt.

    Expected output:

    ```
    List of devices attached
    xxxxxxx device
    ```

## 5. Use `adb reverse` for development server

To allow your app to connect to the Metro development server running on your host machine, use:

```bash
adb reverse tcp:8081 tcp:8081
```

## 6. Run the app

You can now run the app on your device:

```bash
npm run android --prefix app
```

If the bundler can't be reached from the device, run `npx expo start --tunnel` inside WSL2.
