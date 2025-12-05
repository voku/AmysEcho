import '@testing-library/jest-dom/vitest';

// Ensure happy-dom's Blob and File have proper Symbol.toStringTag
if (typeof Blob !== 'undefined' && Blob.prototype) {
  const blobDescriptor = Object.getOwnPropertyDescriptor(Blob.prototype, Symbol.toStringTag);
  if (!blobDescriptor || blobDescriptor.value !== 'Blob') {
    Object.defineProperty(Blob.prototype, Symbol.toStringTag, {
      value: 'Blob',
      configurable: true,
      enumerable: false,
    });
  }
}

if (typeof File !== 'undefined' && File.prototype) {
  const fileDescriptor = Object.getOwnPropertyDescriptor(File.prototype, Symbol.toStringTag);
  if (!fileDescriptor || fileDescriptor.value !== 'File') {
    Object.defineProperty(File.prototype, Symbol.toStringTag, {
      value: 'File',
      configurable: true,
      enumerable: false,
    });
  }
}
