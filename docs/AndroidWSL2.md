# Android Development with WSL2

This guide provides instructions for setting up a reliable Android development environment using WSL2 and a physical Android device.

## Prerequisites

- Windows 11 with WSL2 installed.
- A physical Android device with Developer Mode and USB Debugging enabled.
- A USB cable to connect your Android device to your computer.

## 1. Install `usbipd-win`

`usbipd-win` is a tool that allows you to share USB devices from Windows to WSL2. You can install it using `winget`:

```bash
winget install --interactive --exact dorssel.usbipd-win
```

## 2. Attach your Android device to WSL2

1.  Connect your Android device to your computer via USB.
2.  Open a PowerShell terminal with administrator privileges.
3.  Run the following command to list the available USB devices:

    ```powershell
    usbipd wsl list
    ```

4.  Find your Android device in the list and note its BUSID.
5.  Run the following command to attach the device to WSL2, replacing `<busid>` with the BUSID of your device:

    ```powershell
    usbipd wsl attach --busid <busid>
    ```

## 3. Verify the device is connected to WSL2

1.  Open a terminal in your WSL2 distribution.
2.  Run the following command to list the connected ADB devices:

    ```bash
    adb devices
    ```

3.  You should see your device listed.

## 4. Use `adb reverse` for development server

To allow your app to connect to the Metro development server running on your host machine, you need to use `adb reverse`:

```bash
adb reverse tcp:8081 tcp:8081
```

## 5. Run the app

You can now run the app on your device:

```bash
npm run android --prefix app
```