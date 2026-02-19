/** Minimum number of landmark frames required for a valid training bundle. */
export const MIN_SIGN_SAMPLE_FRAMES = 8;
/** Minimum fraction of frames that must contain hand landmarks (0.0-1.0). */
export const MIN_HAND_FRAME_COVERAGE = 0.7;
/** Maximum average per-frame Euclidean distance (normalized coords) for hand landmarks. */
export const MAX_HAND_JITTER = 0.2;
/** Maximum average per-frame Euclidean distance (normalized coords) for pose landmarks. */
export const MAX_POSE_JITTER = 0.3;
/** Maximum average per-frame Euclidean distance (normalized coords) for face landmarks. */
export const MAX_FACE_JITTER = 0.12;
