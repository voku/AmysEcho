import '@testing-library/jest-dom/vitest';

// Polyfill missing buffer growth flags for jsdom / older Node builds so libraries
// that expect the properties (e.g. whatwg-url via webidl-conversions) do not crash.
if (typeof ArrayBuffer !== 'undefined') {
  const resizableDescriptor = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable');
  if (!resizableDescriptor) {
    Object.defineProperty(ArrayBuffer.prototype, 'resizable', { get: () => false });
  }
}

if (typeof SharedArrayBuffer !== 'undefined') {
  const growableDescriptor = Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'growable');
  if (!growableDescriptor) {
    Object.defineProperty(SharedArrayBuffer.prototype, 'growable', { get: () => false });
  }
}
