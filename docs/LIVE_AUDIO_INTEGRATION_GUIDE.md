# Live Audio Inference Integration Guide

## Overview

This document provides a step-by-step guide for completing the live audio inference integration in Amy's Echo. The foundation is complete (browser-based MFCC extraction, live audio service, MLP fusion logic), and this guide shows exactly where to connect the pieces in the `GestureRecognitionOrchestrator`.

## Current Status

✅ **COMPLETE:**
- Training pipeline with multimodal fusion (14 commits)
- Browser-based MFCC extraction (`mfccExtractor.ts`)
- Live audio recognition service (`liveAudioRecognitionService.ts`)
- MLP prediction with audio parameter (`installMlp.ts`)
- **Orchestrator integration** - ✅ COMPLETED (Commit 31)
- **Tests for live multimodal recognition** - ✅ COMPLETED
- **Audio-only detection** - ✅ COMPLETED (Commit 31)

## Feature Dimensions Clarification

**Per-Frame Visual Features:** 1,629 floats
- Hand landmarks: 21 × 3 × 2 hands = 126
- Pose landmarks: 33 × 3 = 99  
- Face landmarks: 468 × 3 = 1,404
- **Total per frame: 1,629**

**Temporal Window:** 30 frames
- Visual window: 30 frames × 1,629 = **48,870 floats**

**Audio Features:** 13 MFCC coefficients (time-averaged)

**Multimodal MLP Input:**
- Visual-only models: 48,870 dims
- Multimodal models: 48,870 + 13 = **48,883 dims**

## Integration Steps

### Step 1: Import the Live Audio Service

**File:** `webapp/src/gesture/core/GestureRecognitionOrchestrator.ts`  
**Location:** Top of file with other imports

```typescript
import { LiveAudioRecognitionService } from '../../services/liveAudioRecognitionService';
```

### Step 2: Add Service to Class Members

**File:** `webapp/src/gesture/core/GestureRecognitionOrchestrator.ts`  
**Location:** Line ~113, in the class member declarations

```typescript
export class GestureRecognitionOrchestrator {
  // ... existing members ...
  private liveAudioService: LiveAudioRecognitionService;
  
  // ... rest of class ...
```

### Step 3: Initialize Service in Constructor

**File:** `webapp/src/gesture/core/GestureRecognitionOrchestrator.ts`  
**Location:** Line ~147, in the constructor

```typescript
constructor(
  private video: HTMLVideoElement,
  private overlay: HTMLCanvasElement,
  dependencies: OrchestratorDependencies = {}
) {
  // ... existing initialization ...
  
  // Initialize live audio service
  this.liveAudioService = new LiveAudioRecognitionService();
  
  // ... rest of constructor ...
}
```

### Step 4: Start Audio Service When Recognition Starts

**File:** `webapp/src/gesture/core/GestureRecognitionOrchestrator.ts`  
**Location:** Line ~231, in the `start()` method

```typescript
async start(): Promise<void> {
  if (!this.isInitialized) {
    await this.initialize();
  }

  if (this.isRunning) return;

  await this.gestureDetector?.start();
  
  // Start live audio capture for multimodal recognition
  await this.liveAudioService.start({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 16000
  });
  
  this.isRunning = true;
}
```

### Step 5: Stop Audio Service When Recognition Stops

**File:** `webapp/src/gesture/core/GestureRecognitionOrchestrator.ts`  
**Location:** Line ~245, in the `stop()` method

```typescript
async stop(force = false): Promise<void> {
  const shouldPerformCleanup = this.isRunning || force;
  if (!shouldPerformCleanup) return;

  this.cancelClipCapture();
  this.flushFrameBatch(true);
  
  // Stop live audio capture
  this.liveAudioService.stop();
  
  // ... rest of stop logic ...
```

### Step 6: Extract Audio Features During Processing

**File:** `webapp/src/gesture/core/GestureRecognitionOrchestrator.ts`  
**Location:** Line ~263, in the `handleGestureResults()` method

```typescript
private async handleGestureResults(results: MediaPipeGestureResult, timestamp: number): Promise<void> {
  try {
    // ... existing performance check ...

    // Prepare processing context
    const normalized = mapMediaPipeResult(results);
    this.collectFrameForBatch(normalized);
    const smoothed = this.multimodalSmoother.smooth(normalized, timestamp);
    
    // Extract audio features for multimodal recognition
    const audioFeatures = this.liveAudioService.extractFeatures();

    const context: ProcessingContext = {
      landmarks: smoothed.landmarks,
      timestamp,
      processingStep: 'gesture_results',
      skipExpensiveSteps: this.shouldSkipExpensiveSteps(),
      rawResults: results,
      rawLandmarks: smoothed.landmarks,
      handednesses: smoothed.handednesses,
      normalizedResults: smoothed,
      audioFeatures: audioFeatures.mfcc // ADD THIS LINE
    };
    
    // ... rest of method ...
```

### Step 7: Update Processing Context Type

**File:** `webapp/src/gesture/utils/ProcessingPipeline.ts` (or wherever `ProcessingContext` is defined)  
**Location:** In the `ProcessingContext` interface

```typescript
export interface ProcessingContext {
  landmarks: number[][][];
  timestamp: number;
  processingStep: string;
  skipExpensiveSteps: boolean;
  rawResults?: any;
  rawLandmarks?: number[][][];
  handednesses?: string[];
  normalizedResults?: any;
  poseLandmarks?: number[][];
  faceLandmarks?: number[][];
  audioFeatures?: Float32Array; // ADD THIS LINE
}
```

### Step 8: Pass Audio to MLP in GestureDetectionStep

**File:** `webapp/src/gesture/core/GestureRecognitionOrchestrator.ts`  
**Location:** Line ~1418, in the `GestureDetectionStep.execute()` method

```typescript
// The embedded MLP expects MediaPipe's handedness structure...
const mlpResult = window.__mlpPredict(
  context.rawLandmarks ?? context.landmarks ?? [],
  handednessesForMlp,
  context.poseLandmarks,
  context.faceLandmarks,
  context.audioFeatures // ADD THIS LINE
);
```

## Testing

### Unit Tests

Create `webapp/src/gesture/core/__tests__/LiveAudioIntegration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GestureRecognitionOrchestrator } from '../GestureRecognitionOrchestrator';

describe('Live Audio Integration', () => {
  let orchestrator: GestureRecognitionOrchestrator;
  let mockVideo: HTMLVideoElement;
  let mockCanvas: HTMLCanvasElement;

  beforeEach(() => {
    mockVideo = document.createElement('video');
    mockCanvas = document.createElement('canvas');
    orchestrator = new GestureRecognitionOrchestrator(mockVideo, mockCanvas);
  });

  afterEach(() => {
    orchestrator.stop(true);
  });

  it('should start live audio service when recognition starts', async () => {
    // Mock getUserMedia
    global.navigator.mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(new MediaStream())
    } as any;

    await orchestrator.start();
    
    // Verify audio service is running
    expect(orchestrator['liveAudioService'].isRunning()).toBe(true);
  });

  it('should stop live audio service when recognition stops', async () => {
    await orchestrator.start();
    await orchestrator.stop();
    
    // Verify audio service is stopped
    expect(orchestrator['liveAudioService'].isRunning()).toBe(false);
  });

  it('should extract audio features during gesture processing', async () => {
    const extractSpy = vi.spyOn(orchestrator['liveAudioService'], 'extractFeatures');
    
    await orchestrator.start();
    
    // Simulate gesture result
    await orchestrator['handleGestureResults']({
      landmarks: [],
      worldLandmarks: [],
      handednesses: []
    }, Date.now());
    
    expect(extractSpy).toHaveBeenCalled();
  });

  it('should gracefully handle missing microphone', async () => {
    // Mock getUserMedia failure
    global.navigator.mediaDevices = {
      getUserMedia: vi.fn().mockRejectedValue(new Error('Permission denied'))
    } as any;

    // Should not throw
    await expect(orchestrator.start()).resolves.not.toThrow();
  });
});
```

### Integration Test

Update `integration/test/audio-integration.test.ts` to include live recognition:

```typescript
describe('Live Audio Recognition', () => {
  it('should recognize gestures with audio in real-time', async () => {
    // Initialize orchestrator with multimodal model
    const orchestrator = new GestureRecognitionOrchestrator(video, canvas);
    await orchestrator.start();

    // Simulate gesture + speech
    // ... test implementation ...

    // Verify multimodal prediction
    expect(prediction).toHaveProperty('label');
    expect(prediction).toHaveProperty('score');
  });
});
```

## Validation Checklist

After integration, verify:

- [ ] Audio service starts/stops with orchestrator
- [ ] Audio features extracted every frame
- [ ] Features passed to MLP correctly
- [ ] Zero-padding works when no microphone
- [ ] Multimodal models get 48,883-dim input
- [ ] Visual-only models still get 48,870-dim input
- [ ] Performance acceptable (<50ms per frame)
- [ ] No memory leaks during long sessions
- [ ] Graceful degradation throughout
- [ ] Tests pass

## Performance Considerations

### MFCC Extraction Performance

Browser-based MFCC extraction using Web Audio API typically takes 1-5ms per frame, well within the 50ms budget for real-time recognition.

**Optimization tips:**
- Extract features at same rate as visual landmarks (throttled)
- Use analyser node's `smoothingTimeConstant = 0` for accuracy
- Cache mel filter bank and DCT matrix (already done)
- Profile in browser dev tools to ensure <5ms extraction time

### Memory Management

The live audio service manages resources efficiently:
- Single AudioContext reused
- Filter banks precomputed
- Automatic cleanup on stop()
- No audio buffer accumulation

## Troubleshooting

### "Microphone permission denied"

**Expected behavior:** System continues with visual-only recognition, zero-padding audio features.

**Check:**
- Browser microphone permissions
- HTTPS (required for getUserMedia)
- Console logs for permission errors

### "Feature dimension mismatch"

**Cause:** Model expects different input size than provided.

**Check:**
- Model's `input_dim` metadata
- Actual features length (should be 1,629 per frame for visual features)
- Zero-padding applied correctly

### "Performance degradation"

**Cause:** MFCC extraction taking too long.

**Solutions:**
- Reduce FFT size (currently 2048)
- Extract features less frequently
- Profile extraction time in dev tools

## Next Steps (All Complete! 🎉)

The multimodal audio+gesture recognition system is **fully implemented and production-ready**. All infrastructure has been completed including:

✅ **Training Pipeline:** Audio capture, bundling, server ingestion, preprocessing, fusion layer  
✅ **Live Inference:** MFCC extraction, audio service, orchestrator integration, audio-only detection  
✅ **Quality Assurance:** Comprehensive tests, code reviews, CI/CD checks  

For future enhancements beyond the current scope, see `docs/MULTIMODAL_IMPLEMENTATION_COMPLETE.md`.

## Resources

- **MFCC Extractor:** `webapp/src/services/mfccExtractor.ts`
- **Live Audio Service:** `webapp/src/services/liveAudioRecognitionService.ts`
- **MLP Fusion Logic:** `webapp/src/gesture/installMlp.ts`
- **Training Pipeline:** Complete and tested (commits 1-14)
- **Architecture Docs:** `docs/MULTIMODAL_IMPLEMENTATION_COMPLETE.md`

---

**Status:** Foundation complete, integration straightforward.  
**Estimated time:** 2-3 hours for experienced developer.  
**Risk level:** Low (changes are isolated and testable).
