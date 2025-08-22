# Error Handling in Amy's Echo

Amy's Echo aims to surface user-friendly messages while capturing technical details for developers. This document describes the standard pattern for dealing with errors in the mobile app.

## 1. Global Error Boundary

All screens are wrapped in `ChildErrorBoundary`, which catches unexpected crashes and shows a gentle "Let's try again" prompt with a retry button. Errors are logged via the crash reporting service so developers can investigate without exposing technical details to children.

## 2. Log with the shared logger

Use the `logger` utility instead of `console.*` to record errors:

```ts
import { logger } from '../utils/logger';

try {
  // ...
} catch (err) {
  logger.error('Failed to perform action:', err);
}
```

The logger automatically filters output by build type and keeps the console consistent.

## 3. Pass errors through callbacks

Components such as `MediaPipeGestureDetector` accept an `onError` callback. The component invokes the callback whenever the WebView reports a problem, allowing screens to react:

```tsx
const handleError = (msg: string) => {
  logger.warn('Gesture detector error:', msg);
  setProcessingError(msg);
};

<MediaPipeGestureDetector onGestureDetected={onGestureResult} onError={handleError} />
```

## 4. Display a friendly message

Use the shared `ErrorMessage` component to surface problems to the user. It respects accessibility settings and can be reused on any screen.

```tsx
import ErrorMessage from '../components/ErrorMessage';

<ErrorMessage message={processingError} />
```

## 5. Reset when recovered

Clear the error state when the operation succeeds so the UI returns to normal. In gesture recognition, `onGestureResult` resets the `processingError` state when a frame is processed successfully.

Following this pattern keeps technical information in logs while presenting clear, concise messages to Amy and caregivers.
