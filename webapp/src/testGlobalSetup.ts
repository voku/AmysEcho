export default async function globalSetup() {
  if (typeof ArrayBuffer !== 'undefined' && !Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')) {
    Object.defineProperty(ArrayBuffer.prototype, 'resizable', { get: () => false });
  }

  if (typeof SharedArrayBuffer !== 'undefined' && !Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'growable')) {
    Object.defineProperty(SharedArrayBuffer.prototype, 'growable', { get: () => false });
  }
}
