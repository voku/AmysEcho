export {
  withErrorHandling,
  withSyncErrorHandling,
  withRetry,
  createErrorMessage,
  isRetryableError,
  handleApiError,
  safeJsonParse,
  safeJsonStringify,
} from './errorUtils';
export type { ErrorResult, RetryOptions } from './errorUtils';

export {
  validateWithRules,
  commonValidationRules,
  validateGestureData,
  validateApiResponse,
  validateTrainingSample,
  validateProfile,
} from './validationUtils';
export type { ValidationResult, ValidationRule } from './validationUtils';

export {
  base64ToUint8Array,
  base64ToArrayBuffer,
  uint8ArrayToBase64,
  arrayBufferToBase64,
} from './base64';

export {
  cloneLandmarks,
  normalizeHandednessLabels,
  adjustHandednessForMirror,
  createHandLandmarkStabilizer,
} from './landmarkUtils';
export type {
  HandLandmarkStabilizerOptions,
  StabilizedHands,
  HandLandmarkStabilizer,
} from './landmarkUtils';

export {
  slugify,
  normalizeGestureLabel,
} from './stringUtils';
