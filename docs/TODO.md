# Amy's Echo - Updated TODO List

## Current Status Summary
The project has a stable foundation after a major refactor. The database, navigation, and core app structure are complete. The next phase focuses on implementing scaffolded features to reach production readiness.

> Integration tests live under the repo's `integration/test` directory.

## Recognition Ensemble Summary
- Finalized ensemble order: `TFLite → remote → centroid`.
- Profile-aware thresholds use caching to avoid repeated lookups.
- Server recognition remains active during offline fallback for automatic recovery when connectivity returns.
- Softmax temperature calibration balances model confidence outputs.
- Remote inference leverages `AbortController`-based timeouts.

## 🔑 Immediate Gesture Detection & Visualization Fixes

1. [x] Integrate `vision-camera-resize-plugin` for zero-copy frame resizing and color conversion.
2. [x] Verify `extractHandLandmarks` uses the plugin and returns valid coordinates; add temporary logging inside the worklet.
3. [x] Restore gesture classification pipeline:
   - ensure `classifyGesture` consumes the flattened landmark buffer.
   - confirm `mlService.processFrameAsync` sends results back to JS.
4. [x] Fix hand landmark overlay on `RecognitionScreen`:
   - ensure `landmarks` array flows to the overlay with proper scaling.
   - add a debug toggle to display raw landmarks.
5. [x] Regression and stability checks:
   - exercise both online and offline recognition paths within the 400 ms timeout.
   - run `integration/offlineFallback.spec.ts` and `integration/offlineBoot.spec.ts`.

6. [x] Make camera device selection robust (VisionCamera v4 array vs keyed object)
   - Update `RecognitionScreen` to normalize `useCameraDevices()` output and prefer back → front → first available.
   - Acceptance: No “no device” state on typical Android phones; app enters recognition with a camera selected.

7. [x] Simplify landmark extractor for clarity and correctness
   - `app/src/services/landmarkExtractor.ts`:
     - Remove `extractHandLandmarksFlat` and the `FLATTENED_LANDMARKS_SIZE` constant.
     - Process the model’s `Float32Array` directly and reshape to 2D (21×3).
     - Provide a single internal path `extractLandmarksFromFrame` used by both exported APIs.
   - Acceptance: Landmark array length is exactly 21 with 3 coordinates per landmark; logs note plugin vs fallback once.

8. [x] Update classifier integration to consume 2D landmarks
   - `app/src/services/mlService.ts` flattens 2D (21×3) locally for `classifyGesture` and preserves plugin/fallback telemetry.
   - Acceptance: Classification triggers on stable landmarks; no runtime errors from shape mismatches.

9. [x] Normalize landmarks before classification (MediaPipe-style)
   - Implemented a lightweight normalizer (translate to wrist, scale by hand size) before flattening.
   - Gated by `EXPO_PUBLIC_NORMALIZE_LANDMARKS` (default on) for A/B.
   - Acceptance: Reduced variance across distance/orientation; fewer “uncertain” results.

10. [ ] Visualization mapping audit and tests
    - Verify coordinate mapping accounts for aspect-fit letterboxing and mirroring on front camera.
    - Add a tiny unit that validates `mapLandmark` math with synthetic preview/layout sizes.
    - Acceptance: Overlay lines and points align the user’s hand on device (visual inspection checklist included).

11. [ ] Unified debug overlay for field testing
    - Expose FPS, queue depth, circuit breaker, inference path (local/cloud), and plugin vs fallback in one banner.
    - Add a long-press gesture on status text to toggle (already partially implemented; consolidate output).
    - Acceptance: Caregiver/dev can confirm pipeline health on-device without a debugger.

# Amy's Echo - Hand Gesture Recognition Implementation Plan

## Mission: Complete the Hand Gesture Recognition Pipeline

This plan focuses on implementing the missing pieces to make Amy's hand gesture recognition work reliably, based on the actual codebase structure and existing components.

## Current State Analysis

**What exists:**
- ✅ `app/src/screens/RecognitionScreen.tsx` - Main UI that orchestrates camera and recognition
- ✅ `app/src/hooks/useTensorflowModel.ts` - On-device TensorFlow Lite processing
- ✅ `server/src/recognizer.ts` - Remote API for cloud-based gesture classification
- ✅ `app/assets/models/` - TensorFlow Lite model files
- ✅ `CorrectionPanel` component for user feedback

**What's missing:**
- On-device gesture classification (currently only landmark extraction)
- Unified hybrid strategy (local-first, cloud fallback)
- Confidence-based UI feedback
- Model update mechanism

---

## Task 1: Implement On-Device Gesture Classification

### Objective
Create a dedicated gesture classifier that works with the existing landmark extraction to classify gestures locally.

### Current State
`useTensorflowModel.ts` processes camera frames but doesn't classify gestures - it likely only extracts hand landmarks.

### Implementation

#### A. Create Gesture Classifier Module
**File**: `app/src/ml/gestureClassifier.ts` (new file)

**Purpose**: Take hand landmarks and output classified gestures with confidence scores.

```typescript
import { TensorflowModel } from 'react-native-fast-tflite';

export interface GestureResult {
  label: string;
  confidence: number;
  probabilities: number[];
}

export class GestureClassifier {
  private model: TensorflowModel | null = null;
  private labels: string[] = [];

  async loadModel(modelPath: string, labelsOrPath: string[] | string): Promise<void> {
    // Load the gesture classification model
    this.model = await TensorflowModel.loadFromPath(modelPath);

    // Load gesture labels
    if (Array.isArray(labelsOrPath)) {
      this.labels = labelsOrPath;
    } else {
      const { default: FileSystem } = await import('expo-file-system');
      const json = await FileSystem.readAsStringAsync(labelsOrPath);
      const labelData = JSON.parse(json);
      this.labels = Array.isArray(labelData) ? labelData : labelData.labels || [];
    }

    console.log('Gesture classifier loaded with', this.labels.length, 'gestures');
  }

  classify(landmarks: number[]): GestureResult {
    if (!this.model) {
      throw new Error('Model not loaded');
    }

    // Prepare input tensor from landmarks
    const input = new Float32Array(landmarks);
    
    // Run inference
    const output = this.model.runSync([input]) as Float32Array[];
    const probabilities = Array.from(output[0]);
    
    // Find best prediction
    const maxIndex = probabilities.indexOf(Math.max(...probabilities));
    const confidence = probabilities[maxIndex];
    
    return {
      label: this.labels[maxIndex] || 'unknown',
      confidence,
      probabilities
    };
  }

  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
  }
}

// Singleton instance
export const gestureClassifier = new GestureClassifier();
```

#### B. Integrate with Existing TensorFlow Hook
**File**: `app/src/hooks/useTensorflowModel.ts`

**Action**: Modify the hook to use the new gesture classifier after landmark extraction.

```typescript
// Add this import
import { gestureClassifier, GestureResult } from '../ml/gestureClassifier';

// Add to the hook's return interface
interface TensorflowModelHook {
  // ... existing properties
  classifyGesture: (landmarks: number[]) => GestureResult | null;
}

// Inside the hook implementation
const classifyGesture = useCallback((landmarks: number[]) => {
  try {
    if (!isModelLoaded || landmarks.length === 0) {
      return null;
    }
    
    return gestureClassifier.classify(landmarks);
  } catch (error) {
    console.warn('Gesture classification failed:', error);
    return null;
  }
}, [isModelLoaded]);

// Add to return object
return {
  // ... existing returns
  classifyGesture,
};
```

#### C. Update RecognitionScreen Integration
**File**: `app/src/screens/RecognitionScreen.tsx`

**Action**: Use the new gesture classification capability.

```typescript
// Import the hook with new capability
import { useTensorflowModel } from '../hooks/useTensorflowModel';

// Inside RecognitionScreen component
const { processFrame, classifyGesture, isModelLoaded } = useTensorflowModel();

// Add state for gesture results
const [currentGesture, setCurrentGesture] = useState<string>('');
const [gestureConfidence, setGestureConfidence] = useState<number>(0);

// Example frame processing with gesture classification
const handleFrame = useCallback(async (frame: any) => {
  if (!isModelLoaded) return;
  
  // Extract landmarks (existing functionality)
  const landmarks = await processFrame(frame);
  
  if (landmarks && landmarks.length > 0) {
    // NEW: Classify gesture from landmarks
    const gestureResult = classifyGesture(landmarks);
    
    if (gestureResult && gestureResult.confidence > 0.6) {
      setCurrentGesture(gestureResult.label);
      setGestureConfidence(gestureResult.confidence);
      
      // Show gesture to user
      console.log('Recognized gesture:', gestureResult.label, 'confidence:', gestureResult.confidence);
    }
  }
}, [isModelLoaded, processFrame, classifyGesture]);
```

---

## Task 2: Implement Hybrid Recognition Strategy

### Objective
Create a unified recognition flow: try on-device first, fallback to cloud if confidence is low.

### Implementation

#### A. Add Hybrid Logic to RecognitionScreen
**File**: `app/src/screens/RecognitionScreen.tsx`

**Purpose**: Orchestrate local-first, cloud-fallback recognition strategy.

```typescript
// Add these interfaces
interface RecognitionResult {
  gesture: string;
  confidence: number;
  source: 'local' | 'cloud';
}

// Add configuration constants
const LOCAL_CONFIDENCE_THRESHOLD = 0.7;
const CLOUD_FALLBACK_TIMEOUT = 2000; // 2 seconds

// Add hybrid recognition function
const recognizeGesture = useCallback(async (landmarks: number[]): Promise<RecognitionResult | null> => {
  // Step 1: Try local classification first
  const localResult = classifyGesture(landmarks);
  
  if (localResult && localResult.confidence >= LOCAL_CONFIDENCE_THRESHOLD) {
    // High confidence local result - use it immediately
    return {
      gesture: localResult.label,
      confidence: localResult.confidence,
      source: 'local'
    };
  }
  
  // Step 2: Local confidence too low, try cloud
  try {
    console.log('Local confidence low, trying cloud...');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLOUD_FALLBACK_TIMEOUT);
    const cloudResponse = await fetch('https://your-server.com/api/recognize-gesture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ landmarks }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (cloudResponse.ok) {
      const cloudResult = await cloudResponse.json();
      return {
        gesture: cloudResult.label,
        confidence: cloudResult.confidence,
        source: 'cloud'
      };
    }
  } catch (error) {
    console.warn('Cloud recognition failed:', error);
  }
  
  // Step 3: Both failed - return local result if available, or null
  if (localResult) {
    return {
      gesture: localResult.label,
      confidence: localResult.confidence,
      source: 'local'
    };
  }
  
  return null;
}, [classifyGesture]);

// Update frame handler to use hybrid recognition
const handleFrame = useCallback(async (frame: any) => {
  if (!isModelLoaded || isProcessing) return;
  
  setIsProcessing(true);
  
  try {
    const landmarks = await processFrame(frame);
    
    if (landmarks && landmarks.length > 0) {
      const result = await recognizeGesture(landmarks);
      
      if (result) {
        setCurrentGesture(result.gesture);
        setGestureConfidence(result.confidence);
        
        // Visual feedback based on source
        if (result.source === 'local') {
          console.log('✓ Local recognition:', result.gesture);
        } else {
          console.log('☁ Cloud recognition:', result.gesture);
        }
      } else {
        // No recognition - show uncertainty
        setCurrentGesture('uncertain');
        setGestureConfidence(0);
      }
    }
  } finally {
    setIsProcessing(false);
  }
}, [isModelLoaded, isProcessing, processFrame, recognizeGesture]);
```

---

## Task 3: Add Confidence-Based UI Feedback

### Objective
Provide clear visual feedback to Amy about recognition confidence and trigger correction flow when needed.

### Implementation

#### A. Add Confidence Visualization
**File**: `app/src/screens/RecognitionScreen.tsx`

**Purpose**: Show Amy when the system is confident vs. uncertain about her gesture.

```typescript
// Add these state variables for UI feedback
const [showUncertainty, setShowUncertainty] = useState(false);
const [recognitionState, setRecognitionState] = useState<'listening' | 'thinking' | 'confident' | 'uncertain'>('listening');

// Add confidence evaluation function
const evaluateConfidence = useCallback((confidence: number, source: 'local' | 'cloud') => {
  if (confidence >= 0.8) {
    setRecognitionState('confident');
    setShowUncertainty(false);
  } else if (confidence >= 0.5) {
    setRecognitionState('thinking');
    setShowUncertainty(false);
  } else {
    setRecognitionState('uncertain');
    setShowUncertainty(true);
  }
}, []);

// Update the recognition handler
const handleRecognitionResult = useCallback((result: RecognitionResult) => {
  evaluateConfidence(result.confidence, result.source);
  
  if (result.confidence >= 0.6) {
    // Show the recognized gesture
    setCurrentGesture(result.gesture);
    
    // Speak the gesture name
    // (assuming you have a speech service)
    speakGesture(result.gesture);
    
  } else {
    // Show correction panel for low confidence
    setShowUncertainty(true);
    // Could trigger CorrectionPanel here
  }
}, [evaluateConfidence]);

// Add visual feedback in the render section
const getStatusMessage = () => {
  switch (recognitionState) {
    case 'listening': return "Show me your gesture...";
    case 'thinking': return "Let me think...";
    case 'confident': return currentGesture;
    case 'uncertain': return "I'm not sure. Can you help me?";
    default: return "Ready";
  }
};

const getStatusColor = () => {
  switch (recognitionState) {
    case 'confident': return '#4CAF50'; // Green
    case 'thinking': return '#FF9800';  // Orange
    case 'uncertain': return '#F44336'; // Red
    default: return '#2196F3';          // Blue
  }
};

// In the render section, add confidence indicator
<View style={styles.statusContainer}>
  <Text style={[styles.statusText, { color: getStatusColor() }]}>
    {getStatusMessage()}
  </Text>
  
  {/* Confidence bar */}
  <View style={styles.confidenceBar}>
    <View 
      style={[
        styles.confidenceFill, 
        { 
          width: `${gestureConfidence * 100}%`,
          backgroundColor: getStatusColor()
        }
      ]} 
    />
  </View>
  
  {/* Show correction panel when uncertain */}
  {showUncertainty && (
    <Button 
      title="Help Me Choose" 
      onPress={() => {
        // Show CorrectionPanel with options
      }}
    />
  )}
</View>
```

#### B. Add Styling for Confidence UI
Add to styles in `RecognitionScreen.tsx`:

```typescript
const styles = StyleSheet.create({
  // ... existing styles
  
  statusContainer: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 10,
    padding: 15,
  },
  
  statusText: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  
  confidenceBar: {
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    marginBottom: 10,
  },
  
  confidenceFill: {
    height: '100%',
    borderRadius: 3,
  },
});
```

---

## Task 4: Add Model Update Service

### Objective
Allow the app to download updated gesture models without requiring app store updates.

### Implementation

#### A. Create Model Update Service
**File**: `app/src/services/modelUpdateService.ts` (new file)

**Purpose**: Check for and download updated TensorFlow Lite models.

```typescript
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ModelVersion {
  version: string;
  downloadUrl: string;
  checksum: string;
}

export class ModelUpdateService {
  private static readonly MODEL_VERSION_KEY = 'gesture_model_version';
  private static readonly UPDATE_CHECK_URL = 'https://your-server.com/api/model-version';
  
  async checkForUpdates(): Promise<boolean> {
    try {
      // Get current model version
      const currentVersion = await AsyncStorage.getItem(ModelUpdateService.MODEL_VERSION_KEY);
      
      // Check server for latest version
      const response = await fetch(ModelUpdateService.UPDATE_CHECK_URL);
      const latestInfo: ModelVersion = await response.json();
      
      // Compare versions
      if (!currentVersion || currentVersion !== latestInfo.version) {
        console.log('New model version available:', latestInfo.version);
        return true;
      }
      
      return false;
    } catch (error) {
      console.warn('Failed to check for model updates:', error);
      return false;
    }
  }
  
  async downloadLatestModel(): Promise<string | null> {
    try {
      const response = await fetch(ModelUpdateService.UPDATE_CHECK_URL);
      const modelInfo: ModelVersion = await response.json();

      // Create local file path
      const localPath = `${FileSystem.documentDirectory}gesture_model_${modelInfo.version}.tflite`;

      // Download the model
      console.log('Downloading model version:', modelInfo.version);
      const downloadResult = await FileSystem.downloadAsync(
        modelInfo.downloadUrl,
        localPath
      );

      if (downloadResult.status === 200) {
        // Verify checksum
        const fileData = await FileSystem.readAsStringAsync(localPath, { encoding: FileSystem.EncodingType.Base64 });
        const { digestStringAsync, CryptoDigestAlgorithm } = await import('expo-crypto');
        const computed = await digestStringAsync(CryptoDigestAlgorithm.SHA256, fileData);
        if (computed.toLowerCase() !== modelInfo.checksum.toLowerCase()) {
          await FileSystem.deleteAsync(localPath, { idempotent: true });
          throw new Error('Checksum mismatch for downloaded model');
        }

        // Save version info
        await AsyncStorage.setItem(ModelUpdateService.MODEL_VERSION_KEY, modelInfo.version);

        console.log('Model downloaded successfully to:', localPath);
        return localPath;
      } else {
        throw new Error(`Download failed with status: ${downloadResult.status}`);
      }
    } catch (error) {
      console.error('Failed to download model:', error);
      return null;
    }
  }
  
  async getLocalModelPath(): Promise<string | null> {
    try {
      const version = await AsyncStorage.getItem(ModelUpdateService.MODEL_VERSION_KEY);
      
      if (version) {
        const localPath = `${FileSystem.documentDirectory}gesture_model_${version}.tflite`;
        const fileInfo = await FileSystem.getInfoAsync(localPath);
        
        if (fileInfo.exists) {
          return localPath;
        }
      }
      
      return null;
    } catch (error) {
      console.warn('Failed to get local model path:', error);
      return null;
    }
  }
}

export const modelUpdateService = new ModelUpdateService();
```

#### B. Integrate with App Startup
**File**: `app/App.tsx` or `app/src/screens/RecognitionScreen.tsx`

**Action**: Check for model updates when the app starts.

```typescript
import labels from '../assets/models/gesture_labels.json';
import { modelUpdateService } from '../services/modelUpdateService';

// Add to your main component's useEffect
useEffect(() => {
  const initializeModels = async () => {
    try {
      // Check if we have a locally downloaded model
      const localModelPath = await modelUpdateService.getLocalModelPath();
      
      if (localModelPath) {
        console.log('Using downloaded model:', localModelPath);
        // Load the downloaded model with labels from bundle
        await gestureClassifier.loadModel(localModelPath, labels);
      } else {
        console.log('Using bundled model');
        // Load the bundled model and labels
        await gestureClassifier.loadModel('../assets/models/gesture_classifier.tflite', labels);
      }
      
      // Check for updates in background
      const hasUpdate = await modelUpdateService.checkForUpdates();
      if (hasUpdate) {
        console.log('Model update available, downloading...');
        const newModelPath = await modelUpdateService.downloadLatestModel();
        
        if (newModelPath) {
          // Optionally restart recognition with new model
          // or show user a message that update will apply on next app start
        }
      }
      
    } catch (error) {
      console.error('Failed to initialize models:', error);
    }
  };
  
  initializeModels();
}, []);
```

---

## Task 5: Add Comprehensive Testing

### Objective
Ensure the gesture recognition pipeline works correctly through automated tests.

### Implementation

#### A. Unit Tests for Gesture Classifier
**File**: `app/test/unit/gestureClassifier.test.ts` (new file)

```typescript
import { GestureClassifier } from '../../src/ml/gestureClassifier';

describe('GestureClassifier', () => {
  let classifier: GestureClassifier;
  
  beforeEach(() => {
    classifier = new GestureClassifier();
  });
  
  afterEach(() => {
    classifier.dispose();
  });
  
  test('should classify known gesture with high confidence', () => {
    // Mock landmark data for a "wave" gesture
    const waveLandmarks = [
      // Provide a full array of 63 numbers (21 landmarks × 3 coords)
      0.5, 0.3, 0.1,  // wrist
      0.6, 0.2, 0.1,  // thumb tip
      0.7, 0.4, 0.1,
      0.8, 0.5, 0.1,
      0.4, 0.2, 0.1,
      0.3, 0.4, 0.1,
      0.2, 0.5, 0.1,
      0.1, 0.6, 0.1,
      0.5, 0.4, 0.1,
      0.4, 0.5, 0.1,
      0.3, 0.6, 0.1,
      0.2, 0.7, 0.1,
      0.1, 0.8, 0.1,
      0.5, 0.2, 0.1,
      0.4, 0.3, 0.1,
      0.3, 0.4, 0.1,
      0.2, 0.5, 0.1,
      0.1, 0.6, 0.1,
      0.5, 0.1, 0.1,
      0.4, 0.2, 0.1,
      0.3, 0.3, 0.1
    ];
    
    const result = classifier.classify(waveLandmarks);
    
    expect(result.label).toBe('wave');
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.probabilities).toHaveLength(5); // assuming 5 gestures
  });
  
  test('should return low confidence for unclear landmarks', () => {
    // Random noise data
    const noiseLandmarks = Array(63).fill(0).map(() => Math.random());
    
    const result = classifier.classify(noiseLandmarks);
    
    expect(result.confidence).toBeLessThan(0.5);
  });
  
  test('should handle empty landmark input gracefully', () => {
    expect(() => {
      classifier.classify([]);
    }).toThrow('Model not loaded');
  });
});
```

#### B. Integration Tests for Hybrid Recognition
**File**: `app/test/integration/hybridRecognition.test.ts` (new file)

```typescript
import { RecognitionScreen } from '../../src/screens/RecognitionScreen';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// Mock the dependencies
jest.mock('../../src/hooks/useTensorflowModel');
jest.mock('../../src/ml/gestureClassifier');

describe('Hybrid Recognition Integration', () => {
  test('should use local classification when confidence is high', async () => {
    const mockClassifyGesture = jest.fn().mockReturnValue({
      label: 'thumbs_up',
      confidence: 0.9,
      probabilities: [0.1, 0.9, 0.0, 0.0, 0.0]
    });
    
    // Mock the hook to return our mock function
    require('../../src/hooks/useTensorflowModel').useTensorflowModel.mockReturnValue({
      classifyGesture: mockClassifyGesture,
      processFrame: jest.fn().mockResolvedValue([/* mock landmarks */]),
      isModelLoaded: true
    });
    
    const { getByTestId } = render(<RecognitionScreen />);
    
    // Simulate frame processing
    const mockFrame = { /* mock camera frame */ };
    // Trigger frame processing somehow (this depends on your implementation)
    
    await waitFor(() => {
      // Verify local classification was used
      expect(mockClassifyGesture).toHaveBeenCalled();
      
      // Verify UI shows the result
      expect(getByTestId('current-gesture')).toHaveTextContent('thumbs_up');
    });
  });
  
  test('should fallback to cloud when local confidence is low', async () => {
    const mockClassifyGesture = jest.fn().mockReturnValue({
      label: 'uncertain',
      confidence: 0.3,
      probabilities: [0.3, 0.2, 0.2, 0.2, 0.1]
    });
    
    // Mock fetch for cloud API
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ label: 'point', confidence: 0.8 })
    });
    
    require('../../src/hooks/useTensorflowModel').useTensorflowModel.mockReturnValue({
      classifyGesture: mockClassifyGesture,
      processFrame: jest.fn().mockResolvedValue([/* mock landmarks */]),
      isModelLoaded: true
    });
    
    const { getByTestId } = render(<RecognitionScreen />);
    
    // Simulate frame processing
    await waitFor(() => {
      // Verify cloud API was called
      expect(global.fetch).toHaveBeenCalledWith('https://your-server.com/api/recognize-gesture', expect.any(Object));
      
      // Verify UI shows cloud result
      expect(getByTestId('current-gesture')).toHaveTextContent('point');
    });
  });
});
```

---

## Task 6: Device Testing Protocol

### Objective
Create a systematic approach to test gesture recognition on real devices.

### Implementation

#### A. Testing Documentation
**File**: `docs/GestureRecognitionTesting.md` (new file)

```markdown
# Gesture Recognition Testing Protocol

## Setup
1. Install the app on an Android device: `npx expo run:android`
2. Ensure good lighting and clear background
3. Enable developer options and USB debugging
4. Connect device to computer for log monitoring

## Test Gestures
Test each of these gestures 10 times and record results:

1. **Thumbs Up**
   - Hold thumb up, other fingers closed
   - Expected: Should recognize as "thumbs_up" with >80% confidence
   - Record: Recognition accuracy, confidence scores, response time

2. **Open Palm (Stop)**
   - Show open palm facing camera
   - Expected: Should recognize as "stop" with >80% confidence
   - Record: Recognition accuracy, confidence scores, response time

3. **Pointing**
   - Point index finger, other fingers closed
   - Expected: Should recognize as "point" with >80% confidence
   - Record: Recognition accuracy, confidence scores, response time

4. **Peace Sign**
   - Show peace sign (V with index and middle finger)
   - Expected: Should recognize as "peace" with >80% confidence
   - Record: Recognition accuracy, confidence scores, response time

5. **Closed Fist**
   - Make closed fist
   - Expected: Should recognize as "fist" with >80% confidence
   - Record: Recognition accuracy, confidence scores, response time

## Testing Scenarios

### Confidence Threshold Testing
1. Perform each gesture with varying clarity (clear, partially occluded, fast movement)
2. Note when the system triggers cloud fallback
3. Note when correction panel appears

### Hybrid System Testing
1. Test with internet connection (should use cloud fallback when needed)
2. Test without internet (should work with local-only)
3. Verify response times for both modes

### Performance Testing
1. Monitor frame processing time via `adb logcat | grep GestureClassifier`
2. Test for 5 minutes continuously
3. Check for memory leaks or performance degradation

## Success Criteria
- ✅ >80% accuracy on clear gestures
- ✅ <200ms average response time for local recognition
- ✅ <2s response time for cloud fallback
- ✅ No crashes during 5-minute continuous use
- ✅ Appropriate confidence indicators in UI

## Logging Commands
```bash
# Monitor gesture classification logs
adb logcat | grep -E "(GestureClassifier|Recognition)"

# Monitor performance logs
adb logcat | grep -E "(Performance|Latency)"

# Save full test session log
adb logcat > test_session_$(date +%Y%m%d_%H%M%S).log
```
```

#### B. Performance Monitor Utility
**File**: `app/src/utils/performanceMonitor.ts` (new file)

```typescript
interface PerformanceMetric {
  operation: string;
  startTime: number;
  endTime: number;
  metadata?: Record<string, any>;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 100; // Keep last 100 measurements
  
  startTiming(operation: string): number {
    const startTime = Date.now();
    console.log(`[PERF] Starting ${operation}`);
    return startTime;
  }
  
  endTiming(operation: string, startTime: number, metadata?: Record<string, any>): void {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`[PERF] ${operation} completed in ${duration}ms`, metadata);
    
    this.metrics.push({
      operation,
      startTime,
      endTime,
      metadata
    });
    
    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }
  
  getAverageTime(operation: string): number {
    const operationMetrics = this.metrics.filter(m => m.operation === operation);
    
    if (operationMetrics.length === 0) return 0;
    
    const totalTime = operationMetrics.reduce((sum, m) => sum + (m.endTime - m.startTime), 0);
    return totalTime / operationMetrics.length;
  }
  
  logSummary(): void {
    const operations = [...new Set(this.metrics.map(m => m.operation))];
    
    console.log('[PERF] Performance Summary:');
    operations.forEach(operation => {
      const avgTime = this.getAverageTime(operation);
      console.log(`  ${operation}: ${avgTime.toFixed(1)}ms average`);
    });
  }
}

export const performanceMonitor = new PerformanceMonitor();

// Usage example in RecognitionScreen:
// const startTime = performanceMonitor.startTiming('gesture_classification');
// const result = await classifyGesture(landmarks);
// performanceMonitor.endTiming('gesture_classification', startTime, { confidence: result.confidence });
```

---

## Implementation Checklist

### Week 1: Core Classification
- [ ] Create `app/src/ml/gestureClassifier.ts` with TensorFlow Lite integration
- [ ] Modify `useTensorflowModel.ts` to include gesture classification
- [ ] Update `RecognitionScreen.tsx` to use local gesture classification
- [ ] Test basic gesture recognition on device

### Week 2: Hybrid System
- [ ] Implement hybrid recognition logic in `RecognitionScreen.tsx`
- [ ] Add cloud fallback with timeout handling
- [ ] Test local-first, cloud-fallback behavior
- [ ] Validate recognition accuracy improves with hybrid approach

### Week 3: UI & Feedback
- [ ] Add confidence-based visual feedback in UI
- [ ] Implement uncertainty state and correction triggers
- [ ] Style confidence indicators and status messages
- [ ] Test user experience with different confidence levels

### Week 4: Updates & Testing
- [ ] Create `modelUpdateService.ts` for model downloads
- [ ] Integrate model updates with app startup
- [ ] Write comprehensive unit and integration tests
- [ ] Create device testing protocol and run full validation

### Success Metrics
- [ ] **Accuracy**: >80% correct recognition on clear gestures
- [ ] **Speed**: <200ms local classification, <2s cloud fallback
- [ ] **Reliability**: No crashes during 5-minute continuous use
- [ ] **User Experience**: Clear feedback when uncertain, smooth recognition flow

---
## 🚀 PRIORITY 5: Production Readiness

### Deployment & Distribution
- [ ] **Store Preparation**
  - Finalize EAS Build configuration
  - Complete app store metadata and screenshots
  - Implement crash reporting and analytics
  - Test store-ready binaries

- [ ] **Data Management**
  - [x] Implement secure data backup/restore
  - [x] Add GDPR compliance features
    - Provide profile data export and deletion endpoints for caregiver requests
  - [x] Create data export functionality
  - Test data migration scenarios
  - [x] Protect gesture data
    - Implement `GestureDataProtector` for anonymization and AES encryption.
  - [x] Enhance API key security
    - Added hash validation and secure storage in `SecureConfigManager`.

- [ ] **Offline Capability**
  - Ensure full offline functionality
  - Implement offline model training
  - Add offline progress sync
  - Test extended offline usage

### Documentation & Support
- [ ] **User Documentation**
  - [x] Create caregiver quick start guide
- [x] Add troubleshooting documentation
  - [x] Create video tutorials for setup
  - [x] Translate documentation to German

  - [x] **Technical Documentation**
    - [x] Complete API documentation
    - [x] Add deployment guides
    - [x] Create contribution guidelines
    - [x] Document architecture decisions

---

## 🔄 ONGOING MAINTENANCE

### Continuous Improvement
- [ ] **Model Refinement**
  - Regularly retrain models with new data
  - Monitor recognition accuracy metrics
  - Implement A/B testing for model improvements
  - Collect and analyze user feedback

- [ ] **Security Updates**
  - Regular dependency updates
  - Security audit scheduling
  - Privacy compliance monitoring
  - Incident response procedures

### Analytics & Monitoring
- [ ] **Usage Analytics**
- [x] Track gesture recognition success rates
- [x] Monitor user engagement patterns
  - [x] Analyze correction frequency
  - [x] Generate improvement insights

---

## 🎯 SUCCESS METRICS

### Technical Metrics
- Gesture recognition accuracy > 95%
- App response time < 200ms
- Offline functionality 100% available
- Battery usage < 5% per hour of active use

### User Experience Metrics
- Successful gesture communication per session > 80%
- User retention rate > 90% after first week
- Caregiver satisfaction score > 4.5/5
- Child engagement duration > 15 minutes per session

### Impact Metrics
- Daily successful communications tracked
- New gestures learned per week
- Caregiver confidence improvement
- Family communication satisfaction

---

*Last Updated: Based on repository state as of current analysis*
*Project Goal: Turn Amy's gestures into understanding. Every time.*
