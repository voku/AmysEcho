// Thin facade mapping to existing mlService pipeline
// Local-first with 400ms cloud fallback, thresholds and circuit breaker implemented in mlService.

export { useGestureClassifier as useHybridFrameProcessor } from './mlService';
export { HYBRID_DEFAULTS } from './hybridDefaults';

