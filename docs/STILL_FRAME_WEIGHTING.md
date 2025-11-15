# Still Frame Weighting in Training Pipeline

## Overview

The training pipeline now prioritizes still frames over video frames when building training samples. This is crucial because still frames represent the precise, target hand position for each gesture, while video frames capture transitional movements.

## Why This Matters

When training the gesture recognition model:
- **Still frames** show the canonical hand position that defines the gesture
- **Video frames** capture the movement leading to/from the gesture
- Without weighting, video frames would dilute the target position
- With weighting, the model learns the correct target position while still benefiting from video frame context

## Configuration

### Environment Variable
```bash
MLP_STILL_FRAME_WEIGHT=10.0  # Default value
```

This controls how much more influence a still frame has compared to a single video frame.

### Default Behavior
- **Video frames**: weight = 1.0 (default)
- **Still frames**: weight = 10.0 (configurable via `MLP_STILL_FRAME_WEIGHT`)

## How It Works

### Weighted Average Formula
```
weighted_landmarks = sum(landmarks_i × weight_i) / sum(weight_i)
```

### Example Scenarios

#### Scenario 1: Video-Only Bundle
```json
{
  "frames": [
    {"landmarks": [[0.1, 0.2, 0.3], ...]},  // weight defaults to 1.0
    {"landmarks": [[0.15, 0.25, 0.35], ...]}
  ]
}
```
Result: Simple average of all frames (backward compatible)

#### Scenario 2: Still-Only Bundle
```json
{
  "frames": [
    {"landmarks": [[0.5, 0.6, 0.7], ...], "weight": 10.0}
  ]
}
```
Result: Exactly the still frame landmarks (weight has no effect with single frame)

#### Scenario 3: Mixed Bundle (1 video + 1 still)
```json
{
  "frames": [
    {"landmarks": [[0.0, 0.0, 0.0], ...], "weight": 1.0},    // video
    {"landmarks": [[1.0, 1.0, 1.0], ...], "weight": 10.0}   // still
  ]
}
```
Result: `(0.0×1.0 + 1.0×10.0) / 11.0 = 0.909`
- Still frame has 90.9% influence
- Video frame has 9.1% influence

#### Scenario 4: Realistic Bundle (5 video + 1 still)
```json
{
  "frames": [
    {"landmarks": [[0.0, 0.0, 0.0], ...]},  // video (weight=1.0)
    {"landmarks": [[0.0, 0.0, 0.0], ...]},  // video (weight=1.0)
    {"landmarks": [[0.0, 0.0, 0.0], ...]},  // video (weight=1.0)
    {"landmarks": [[0.0, 0.0, 0.0], ...]},  // video (weight=1.0)
    {"landmarks": [[0.0, 0.0, 0.0], ...]},  // video (weight=1.0)
    {"landmarks": [[1.0, 1.0, 1.0], ...], "weight": 10.0}  // still
  ]
}
```
Result: `10.0 / 15.0 = 0.667`
- Still frame has 66.7% influence despite being only 1 of 6 frames
- Video frames collectively have 33.3% influence

## Implementation Details

### Modified Functions

#### `flatten_landmarks_mean(frames: List[dict])`
- Now reads optional `weight` field from each frame dictionary
- Defaults to 1.0 for frames without explicit weight
- Computes weighted average across all landmarks

#### `build_samples_from_manifest(manifest_path: Path)`
- Automatically marks still frames with `STILL_FRAME_WEIGHT`
- Video frames retain default weight of 1.0
- Mixed bundles benefit from both still precision and video context

### Backward Compatibility

The implementation is fully backward compatible:
- Old bundles without weights work exactly as before
- The `weight` field is optional and defaults to 1.0
- Existing cached landmarks remain valid

## Testing

The feature is covered by comprehensive tests:
- `test_still_frames_have_higher_weight_than_video_frames`: Integration test
- `test_flatten_landmarks_mean_weighted_average`: Unit test for weighted averaging
- `test_flatten_landmarks_mean_backward_compatibility`: Ensures old code works
- All existing tests pass without modification

## Tuning the Weight

The default weight of 10.0 was chosen to strongly prioritize still frames while still allowing video frames to contribute. You can adjust this based on your needs:

- **Higher weight (e.g., 50.0)**: Still frame almost completely dominates
- **Lower weight (e.g., 3.0)**: More balanced between still and video
- **Weight = 1.0**: Equal treatment (not recommended)

To change the weight:
```bash
export MLP_STILL_FRAME_WEIGHT=5.0
python -m amyserver_tools.train_mlp
```

## Impact on Model Training

With this change:
1. **Better accuracy**: Model learns the correct target position
2. **Faster convergence**: Less noise from transitional frames
3. **More consistent**: Still frames are more reliable than video capture
4. **Maintained context**: Video frames still contribute valuable information

The weighted approach ensures Amy's gesture model focuses on the precise hand positions that define each gesture, leading to more accurate recognition.
