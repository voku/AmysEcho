# Sign Language Variation Learning System

## Overview

The Sign Language Variation Learning System enables Amy's Echo to learn from and adapt to Amy's natural signing variations. Instead of forcing a single "correct" way to perform each sign, the system recognizes that each child has their own unique signing style and learns to recognize all of their variations.

## Amy First Principles

This system embodies our core Amy First commitments:

- ✅ **Zero frustration** - Recognizes Amy's natural signing variations
- ✅ **Zero judgment** - Celebrates all signing attempts, learning from each one
- ✅ **Zero delay** - Adapts in real-time as she uses the app
- ✅ **Personal growth** - Her signing style becomes the model's foundation
- ✅ **Caregiver support** - German-language insights help caregivers understand progress

## Architecture

### Components

1. **SignVariationTracker** (`webapp/src/services/signVariationTracker.ts`)
   - Captures different ways Amy performs each sign
   - Clusters similar variations together
   - Creates confidence-weighted canonical templates
   - Provides learning metrics and insights

2. **Variation-Enhanced Training** (`webapp/src/training/variationEnhancedTraining.ts`)
   - Enhances training bundles with variation metadata
   - Generates training recommendations
   - Prepares variation templates for model training
   - Provides German-language insights for caregivers

3. **GestureRecognitionOrchestrator Integration**
   - Tracks variations in real-time during gesture recognition
   - Records success/failure for each variation
   - Provides variation metrics for debugging and optimization

## How It Works

### 1. Variation Capture

Every time Amy performs a sign, the system:
1. Captures hand landmarks, pose, and face data
2. Records the gesture label and confidence
3. Notes whether it was successfully recognized
4. Stores this as a variation with timestamp and profile ID

```typescript
// Automatic tracking during gesture recognition
this.variationTracker.recordVariation(
  gesture,
  landmarks,
  confidence,
  successfulMatch,
  profileId
);
```

### 2. Variation Clustering

Similar variations are grouped into clusters:
- Compares hand landmark positions using Euclidean distance
- Groups variations with >85% similarity together
- Requires minimum 3 samples to form a cluster
- Tracks success rate for each cluster

```typescript
// Get all variation clusters for a gesture
const clusters = tracker.getVariationClusters('hello');

// Get the most frequently used variation
const dominant = tracker.getDominantCluster('hello');
```

### 3. Learning Metrics

The system provides insights about variation patterns:

```typescript
const metrics = tracker.getLearningMetrics('hello');
// Returns:
// {
//   gesture: 'hello',
//   totalVariations: 15,
//   activeClusters: 2,
//   dominantCluster: 'cluster_xyz',
//   variationDiversity: 0.6,  // 0-1 scale
//   recommendTraining: true,
//   reason: 'Viele verschiedene Ausführungen - Training könnte helfen'
// }
```

### 4. Training Enhancement

When creating training bundles, variation data is automatically included:

```typescript
const enhanced = enhanceWithVariationData(payload, variationTracker);
// Adds variationData to the bundle:
// {
//   dominantCluster: 'cluster_abc',
//   variationDiversity: 0.6,
//   totalVariations: 15,
//   recommendTraining: true,
//   canonicalTemplates: 2
// }
```

### 5. Caregiver Insights

The system generates German-language insights for caregivers:

```typescript
const insights = generateTrainingInsights(tracker, recentGestures);
// Returns:
// {
//   summary: 'Amy zeigt viele verschiedene Ausführungen ihrer Gesten...',
//   recommendations: ['Üben Sie diese Gesten öfter: hello, goodbye'],
//   strengths: ['thank_you', 'yes'],
//   needsPractice: ['hello', 'please']
// }
```

## Data Flow

```
Camera
  ↓
MediaPipe Hand Detection
  ↓
GestureRecognitionOrchestrator
  ↓
[Gesture Recognition] ←→ [SignVariationTracker]
  ↓                           ↓
Speech Output            Variation Clustering
                              ↓
                         Training Recommendations
                              ↓
                    Enhanced Training Bundle
                              ↓
                      Model Retraining
                              ↓
                    Improved Recognition
```

## Storage and Persistence

Variation data is stored in memory and can be exported/imported:

```typescript
// Export for persistence
const data = tracker.exportData();
localStorage.setItem('variations', JSON.stringify(data));

// Import on app start
const stored = localStorage.getItem('variations');
if (stored) {
  tracker.importData(JSON.parse(stored));
}
```

### Automatic Cleanup

Old variations are automatically cleaned up:
- Variations older than 7 days are removed
- Cleanup runs periodically (every 100 gestures)
- Clusters are also cleaned up based on last usage

## Configuration

Key thresholds and parameters:

```typescript
// SignVariationTracker settings
MAX_VARIATIONS_PER_GESTURE = 100
VARIATION_SIMILARITY_THRESHOLD = 0.85  // 85% similarity to cluster
MIN_CLUSTER_SIZE = 3                   // Minimum samples per cluster
CLUSTER_STABILITY_DAYS = 7             // Retention period

// Training recommendations
HIGH_DIVERSITY_THRESHOLD = 0.7         // Triggers high-priority recommendation
MEDIUM_DIVERSITY_THRESHOLD = 0.5       // Triggers medium-priority
```

## Usage Examples

### Track Variations During Recognition

Variations are automatically tracked in `GestureRecognitionOrchestrator`. No additional code needed.

### Get Training Recommendations

```typescript
import { getVariationTrainingRecommendations } from './training/variationEnhancedTraining';

const recommendations = getVariationTrainingRecommendations(
  variationTracker,
  ['hello', 'goodbye', 'thank_you']
);

recommendations.forEach(rec => {
  console.log(`${rec.gesture}: ${rec.priority} priority`);
  console.log(`Reason: ${rec.reason}`);
});
```

### Enhance Training Bundle

```typescript
import { enhanceWithVariationData } from './training/variationEnhancedTraining';

const payload = {
  profileId: 'amy-profile',
  label: 'hello',
  frames: [...],
  clip: videoBlob,
  still: imageBlob,
};

const enhanced = enhanceWithVariationData(payload, variationTracker);
// Upload enhanced bundle to server
await uploadTrainingBundle(enhanced);
```

### Display Caregiver Insights

```typescript
import { generateTrainingInsights } from './training/variationEnhancedTraining';

const insights = generateTrainingInsights(
  variationTracker,
  recentlyUsedGestures
);

// Display in UI
<div className="insights">
  <h2>{insights.summary}</h2>
  <ul>
    {insights.recommendations.map(rec => (
      <li key={rec}>{rec}</li>
    ))}
  </ul>
  
  <h3>Stärken</h3>
  <ul>{insights.strengths.map(g => <li key={g}>{g}</li>)}</ul>
  
  <h3>Üben</h3>
  <ul>{insights.needsPractice.map(g => <li key={g}>{g}</li>)}</ul>
</div>
```

## Testing

### Run Tests

```bash
# Test variation tracker
npm test -- signVariationTracker.test.ts

# Test training enhancements
npm test -- variationEnhancedTraining.test.ts
```

### Test Coverage

- **SignVariationTracker**: 19 tests covering variation recording, clustering, metrics, and persistence
- **Variation-Enhanced Training**: 13 tests covering bundle enhancement, recommendations, and insights

## Future Enhancements

### Server-Side Training Integration

Extend `train_mlp.py` to use variation data:
- Load variation clusters from training bundles
- Use canonical templates as additional training samples
- Weight samples based on cluster success rates
- Create variation-aware model architectures

### Real-Time Variation Templates

Use variation clusters for improved recognition:
- Match against dominant cluster templates first
- Fall back to other clusters if confidence is low
- Update templates based on recent successful recognitions

### Advanced Clustering

Improve variation clustering:
- Use DTW (Dynamic Time Warping) for temporal patterns
- Include pose and face landmarks in similarity calculation
- Implement hierarchical clustering for related gestures
- Detect and suggest custom gesture variations

## Troubleshooting

### High Variation Diversity

If variationDiversity is consistently >0.7:
- Amy may be learning the sign
- The sign may be ambiguous or complex
- Consider additional training sessions
- Check if lighting or camera position varies

### No Clusters Forming

If clusters.length === 0:
- Need at least 3 successful variations to form a cluster
- Variations may be too different (similarity <85%)
- Check that gesture recognition is working correctly

### Recommendations Not Appearing

If recommendTraining is always false:
- Diversity may be low (good thing!)
- Success rates may be high (also good!)
- Try recording more variations to see patterns

## Related Documentation

- `docs/planning/todo.md` - Overall project roadmap
- `docs/research/ml-llm-integration.md` - ML training pipeline
- `docs/training/video-recording-and-training-workflow.md` - Training workflow
- `webapp/src/services/activeLearningService.ts` - Active learning for weak areas
- `webapp/src/gesture/utils/PersonalizedThresholdManager.ts` - Dynamic thresholds

## German UI Messages

All user-facing messages are in German:

- "Viele verschiedene Ausführungen - Training könnte helfen" - High diversity
- "Verschiedene Ausführungen - gelegentliches Üben empfohlen" - Medium diversity
- "Amy zeigt viele verschiedene Ausführungen ihrer Gesten. Das ist normal beim Lernen!" - High diversity summary
- "Amy wird immer konsistenter bei ihren Gesten. Tolles Training!" - Low diversity summary
- "Üben Sie diese Gesten öfter: ..." - Practice recommendations
