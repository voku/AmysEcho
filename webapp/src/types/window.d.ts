/**
 * Window extensions for Amy's Echo
 * Declares additional properties on the global window object
 */

declare global {
  interface Window {
    /**
     * Custom fallback confidence threshold for gesture recognition
     * Default: 0.35
     */
    __fallbackThreshold?: number;
    
    /**
     * Custom MLP (Multi-Layer Perceptron) confidence threshold for gesture recognition
     * Default: 0.05
     */
    __mlpThreshold?: number;
    
    /**
     * Current active profile ID for tracking variations and personalizations
     */
    __currentProfileId?: string;
    
    /**
     * Text to display when prompting user to tap to start gesture recognition
     */
    __tapToStart?: string;
    
    /**
     * Error message template when gesture recognizer initialization fails
     */
    __recognizerInitFailed?: string;
    
    /**
     * Error message template for prediction errors
     */
    __predictionError?: string;
    
    /**
     * Error message template for camera errors
     */
    __cameraError?: string;
    
    /**
     * Camera facing mode ('user' for front camera, 'environment' for back camera)
     */
    __facingMode?: 'user' | 'environment';
    
    /**
     * Whether to mirror the camera overlay
     */
    __mirrorOverlay?: boolean;
    
    /**
     * React Native WebView message posting interface
     */
    ReactNativeWebView?: {
      postMessage?: (message: string) => void;
    };
  }
}

export {};
