/**
 * Type definitions for MediaPipe Tasks Vision results and related interfaces
 */
// Type guards
export function isGestureMessage(message) {
    return message.type === 'gesture';
}
export function isErrorMessage(message) {
    return message.type === 'error';
}
export function isTelemetryMessage(message) {
    return message.type === 'telemetry';
}
export function isTwoHandGesture(gesture) {
    return gesture && typeof gesture === 'object' && 'left' in gesture && 'right' in gesture;
}
