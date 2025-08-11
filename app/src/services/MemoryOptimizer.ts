import * as Device from 'expo-device';

/**
 * Determines an appropriate frame buffer size based on device memory.
 * Older devices with limited memory use a smaller buffer to reduce pressure.
 */
export function recommendedBufferSize(): number {
  const total = (Device as any).totalMemory ?? 4 * 1024 * 1024 * 1024; // default to 4GB
  return total < 2 * 1024 * 1024 * 1024 ? 2 : 3;
}
