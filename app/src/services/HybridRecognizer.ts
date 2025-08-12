// Thin facade mapping to existing mlService pipeline
// Local-first with 400ms cloud fallback, thresholds and circuit breaker implemented in mlService.

export { useGestureClassifier as useHybridFrameProcessor } from './mlService';

export const HYBRID_DEFAULTS = {
  localThreshold: 0.6,
  cloudThreshold: 0.8,
  remoteTimeoutMs: 400,
  maxConsecutiveTimeouts: 3,
  cooldownMs: 10 * 60 * 1000,
};

