import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';

export default async function globalSetup() {
  (globalThis as any).Blob = NodeBlob;
  (globalThis as any).File = NodeFile;

  if (typeof ArrayBuffer !== 'undefined' && !Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')) {
    Object.defineProperty(ArrayBuffer.prototype, 'resizable', {
      get: () => false,
      enumerable: false,
      configurable: true,
    });
  }

  if (typeof SharedArrayBuffer !== 'undefined' && !Object.getOwnPropertyDescriptor(SharedArrayBuffer.prototype, 'growable')) {
    Object.defineProperty(SharedArrayBuffer.prototype, 'growable', {
      get: () => false,
      enumerable: false,
      configurable: true,
    });
  }

  try {
    const blob = new Blob();
    if (Object.prototype.toString.call(blob) !== '[object Blob]') {
      (globalThis as any).Blob = NodeBlob;
    }
  } catch (error) {
    (globalThis as any).Blob = NodeBlob;
  }

  try {
    const file = new File([], 'stub');
    if (Object.prototype.toString.call(file) !== '[object File]') {
      (globalThis as any).File = NodeFile;
    }
  } catch (error) {
    (globalThis as any).File = NodeFile;
  }
}
