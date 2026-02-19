/** Mindestanzahl an Landmark-Frames für eine gültige Trainingsaufnahme. */
export const MIN_SIGN_SAMPLE_FRAMES = 8;
/** Mindestanteil an Frames mit Hand-Landmarks (0.0-1.0). */
export const MIN_HAND_FRAME_COVERAGE = 0.7;
/** Maximale mittlere Frame-zu-Frame-Distanz für Hand-Landmarks (normalisierte Koordinaten). */
export const MAX_HAND_JITTER = 0.2;
/** Maximale mittlere Frame-zu-Frame-Distanz für Pose-Landmarks (normalisierte Koordinaten). */
export const MAX_POSE_JITTER = 0.3;
/** Maximale mittlere Frame-zu-Frame-Distanz für Face-Landmarks (normalisierte Koordinaten). */
export const MAX_FACE_JITTER = 0.12;
