/**
 * Bundled into app/assets/gestureDetector.js for the WebView.
 * Run `npm run build:webview --prefix app` to regenerate.
 */
import { unzipSync, unzip } from 'fflate';
import { installMlp } from '../src/webview/installMlp';
import { HAND_CONNECTIONS } from '../src/constants/hand';
import type {
  GestureRecognizerLike,
  TwoHandGesture
} from './types/MediaPipeTypes';

// Import new modular components
import { GestureDetector } from './core/GestureDetector';
import { ResourceManager } from './utils/ResourceManager';
import { loadConfig } from './config/GestureConfig';

// Forward script errors to React Native for easier debugging
const onError = (e: ErrorEvent) => {
  try {
    // Send a generic child-friendly error message instead of technical details
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({
        type: 'error',
        message: 'gesture_processing_error', // Generic identifier for React Native to handle
        // Keep technical details for logging but don't send to UI
        _technical: {
          message: e.message,
          file: e.filename,
          line: e.lineno,
          col: e.colno,
          stack: e.error?.stack || null,
        },
      }),
    );
  } catch (err) {
    console.warn('Failed to forward script error event:', err);
  }
};
window.addEventListener('error', onError);

const onUnhandledRejection = (e: PromiseRejectionEvent) => {
  try {
    // Send a generic child-friendly error message instead of technical details
    window.ReactNativeWebView?.postMessage?.(
      JSON.stringify({
        type: 'error',
        message: 'gesture_processing_error', // Generic identifier for React Native to handle
        // Keep technical details for logging but don't send to UI
        _technical: {
