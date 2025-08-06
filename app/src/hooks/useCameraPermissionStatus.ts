import { useEffect, useState } from 'react';
import { useCameraPermission } from 'react-native-vision-camera';

/**
 * Consistent camera permission handling across screens.
 * React Native Vision Camera's `useCameraPermission` hook returns a new object
 * on each call, which can lead to stale values if used in multiple places.
 * This hook wraps it and provides a stable permission flag that updates when
 * the underlying permission state changes.
 */
export function useCameraPermissionStatus() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [granted, setGranted] = useState(hasPermission);

  useEffect(() => {
    setGranted(hasPermission);
  }, [hasPermission]);

  return { hasPermission: granted, requestPermission };
}
