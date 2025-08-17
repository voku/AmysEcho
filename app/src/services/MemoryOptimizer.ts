/**
 * Determines an appropriate frame buffer size.
 * To avoid optional native module dependencies in dev-client, we use a safe default.
 * Can be tuned later if memory hints are available.
 */
export function recommendedBufferSize(): number {
  return 3; // safe default that balances memory and throughput
}
