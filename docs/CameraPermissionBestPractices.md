# Camera Permission Best Practices

To keep gesture detection secure and transparent:

- Verify the origin of each permission request before granting access to restricted resources. Android's `PermissionRequest` API exposes the requesting origin so hosts can make informed decisions.
- Grant only the resources you explicitly need. Restricting grants prevents accidental exposure when additional resources are requested.
- Configure the WebView to automatically grant previously approved requests only when they originate from the same host. Otherwise, prompt the user. (iOS only via `mediaCapturePermissionGrantType`)

These practices reduce the risk of unauthorized camera use while keeping the user in control.

### Android

Use `onPermissionRequest` to validate both origin and requested resources before granting camera access:

```tsx
onPermissionRequest={(e) => {
  const { origin, resources, grant, deny } = e.nativeEvent;
  if (new URL(origin).origin === 'https://camera.local' && resources.includes('VIDEO_CAPTURE')) {
    grant(['VIDEO_CAPTURE']);
  } else {
    deny();
  }
}}
```

## References

- [Android `PermissionRequest` API](https://developer.android.com/reference/android/webkit/PermissionRequest)
- [React Native WebView `mediaCapturePermissionGrantType` property](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md#mediacapturepermissiongranttype)
