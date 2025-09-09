# Predictive Gestures Implementation

This document describes the current implementation of predictive gestures in Amy's Echo.

## Overview

Predictive gestures are implemented through two main services:

1. **ContextAwareRecognitionService** (`app/src/services/contextAwareRecognitionService.ts`) - Handles sequence prediction and pattern learning
2. **GestureSuggester** (`app/src/services/gestureSuggester.ts`) - Provides intelligent suggestions for failed attempts

## Key Features

### 1. Sequence-Based Prediction

The `ContextAwareRecognitionService` learns and predicts gesture sequences:

- **Pattern Learning:** Records transitions between gestures with probabilities
- **Time-of-Day Context:** Maintains separate sequence patterns for different times of day
- **Confidence Tracking:** Associates confidence levels with each sequence transition

- **Prediction Method:** `getPredictedGestures(currentGesture?)` returns up to 3 likely next gestures

### 2. Intelligent Suggestions

The `GestureSuggester` provides contextual suggestions when gestures fail:

- **History-Based:** Suggests recently successful gestures
- **Similarity-Based:** Analyzes hand shapes to suggest similar gestures
- **Context-Based:** Considers time of day for appropriate suggestions
- **Confusion Patterns:** Learns common mistakes and suggests alternatives

### 3. Multi-Factor Suggestion System

Suggestions are generated from multiple sources:

```typescript
interface GestureSuggestion {
  id: string;
  label: string;
  confidence: number;
  reason: 'similarity' | 'history' | 'context' | 'common_confusion';
}
```

## Implementation Details

### Sequence Prediction Algorithm

```typescript
// From ContextAwareRecognitionService
private updateSequenceForPrevious(previousGesture: string, currentGesture: string, confidence: number, timeOfDay: string): void {
  // Updates transition probabilities between gestures
  // Maintains top 5 sequences per gesture
  // Applies recency boosting for recent patterns
}
```

### Suggestion Generation

```typescript
// From GestureSuggester
getSuggestions(failedGesture: string | null, context: GestureContext, maxSuggestions: number = 3): GestureSuggestion[] {
  // Combines multiple suggestion sources
  // Deduplicates and ranks by confidence
  // Returns top suggestions
}
```

## Integration Points

### RecognitionScreen Integration

The prediction and suggestion features are integrated into `RecognitionScreen.tsx`:

- **Real-time Suggestions:** Failed gestures trigger contextual suggestions
- **Prediction Display:** Shows predicted next gestures after successful recognition
- **Gesture History:** Maintains recent gesture context for better predictions

### Data Flow

1. **Gesture Recognition:** Records successful gestures with context
2. **Pattern Learning:** Updates sequence probabilities and time-of-day patterns
3. **Prediction:** Generates likely next gestures based on current context
4. **Suggestion:** Provides alternatives when recognition fails

## Usage Examples

### Getting Predictions
```typescript
import { contextAwareRecognitionService } from '../services/contextAwareRecognitionService';

const predictions = contextAwareRecognitionService.getPredictedGestures('hello');
// Returns: [{gesture: 'thank_you', probability: 0.8, reason: 'Often follows hello in morning'}]
```

### Getting Suggestions
```typescript
import GestureSuggester from '../services/gestureSuggester';

const suggestions = gestureSuggester.getSuggestions('failed_gesture', context);
// Returns array of GestureSuggestion objects
```

## Performance Considerations

- **Pattern Storage:** Uses AsyncStorage for persistence across sessions
- **Memory Management:** Limits recent gesture history to 20 items
- **Batch Updates:** Saves patterns every 10 gestures to balance performance and data safety
- **Cache TTL:** Implements time-based cache invalidation for suggestions

## Analytics Integration

The system integrates with analytics to track:

- **Prediction Accuracy:** Success rate of predicted gestures
- **Suggestion Effectiveness:** How often suggestions lead to successful gestures
- **Pattern Evolution:** Changes in gesture sequences over time

## Future Enhancements

The current implementation provides a solid foundation. Potential improvements include:

- **Advanced ML Models:** Replace simple probability with more sophisticated ML algorithms
- **User Feedback Loop:** Allow users to rate suggestion quality
- **Cross-Session Learning:** Better persistence of patterns across app restarts
- **Personalization:** More granular context consideration (location, activity type)
