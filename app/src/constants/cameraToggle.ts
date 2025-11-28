export type CameraFacingMode = 'user' | 'environment';

export const CAMERA_TOGGLE_COPY = {
  label: 'Aktive Kamera',
  front: 'Vorderseite',
  rear: 'Rückseite',
  switchToRear: 'Zur Rückkamera',
  switchToFront: 'Zur Frontkamera',
  accessibilityLabel: 'Kamera wechseln',
  accessibilityHint: 'Zwischen Vorder- und Rückkamera umschalten',
} as const;

export const getCameraFacingText = (facingMode: CameraFacingMode): string =>
  facingMode === 'user' ? CAMERA_TOGGLE_COPY.front : CAMERA_TOGGLE_COPY.rear;

export const getCameraStatusText = (facingMode: CameraFacingMode): string =>
  `${CAMERA_TOGGLE_COPY.label}: ${getCameraFacingText(facingMode)}`;

export const getCameraToggleActionText = (facingMode: CameraFacingMode): string =>
  facingMode === 'user'
    ? CAMERA_TOGGLE_COPY.switchToRear
    : CAMERA_TOGGLE_COPY.switchToFront;

export const getNextCameraFacingMode = (
  current: CameraFacingMode,
): CameraFacingMode => (current === 'user' ? 'environment' : 'user');
