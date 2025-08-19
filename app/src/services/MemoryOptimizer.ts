import * as Device from 'expo-device';

/**
 * Determines an appropriate frame buffer size.
 * To avoid optional native module dependencies in dev-client, we use a safe default.
 * Can be tuned later if memory hints are available.
 */
export function recommendedBufferSize(): number {
  // On low-memory devices, use a smaller buffer to reduce memory pressure.
  if ((Device as any).totalMemory && (Device as any).totalMemory < 1024 * 1024 * 1024) { // Less than 1GB
    return 2;
  }
  return 3; // safe default that balances memory and throughput
}
