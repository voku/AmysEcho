import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';

const isValidBlob = (ctor: typeof Blob | undefined): ctor is typeof Blob => {
  if (!ctor) return false;
  try {
    const blob = new ctor();
    return Object.prototype.toString.call(blob) === '[object Blob]';
  } catch (error) {
    return false;
  }
};

const isValidFile = (ctor: typeof File | undefined): ctor is typeof File => {
  if (!ctor) return false;
  try {
    const file = new ctor([], 'stub');
    return Object.prototype.toString.call(file) === '[object File]';
  } catch (error) {
    return false;
  }
};

export default async function globalSetup() {
  const originalBlob = globalThis.Blob as typeof Blob | undefined;
  const originalFile = globalThis.File as typeof File | undefined;

  const activeBlob = isValidBlob(originalBlob) ? originalBlob : (isValidBlob(NodeBlob as any) ? (NodeBlob as any) : NodeBlob);
  (globalThis as any).Blob = activeBlob;

  const activeFile = isValidFile(originalFile)
    ? originalFile
    : (isValidFile(NodeFile as any) ? (NodeFile as any) : NodeFile);
  (globalThis as any).File = activeFile;

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

  const ensureToStringTag = (ctor: { prototype?: any } | undefined, tag: string) => {
    if (!ctor?.prototype) return;
    const descriptor = Object.getOwnPropertyDescriptor(ctor.prototype, Symbol.toStringTag);
    if (!descriptor || descriptor.value !== tag) {
      try {
        Object.defineProperty(ctor.prototype, Symbol.toStringTag, { value: tag, configurable: true });
      } catch (error) {
        // Ignore if the environment prevents redefining the tag; fallback relies on the constructor swap above.
      }
    }
  };

  ensureToStringTag((globalThis as any).Blob, 'Blob');
  ensureToStringTag((globalThis as any).File, 'File');
}
