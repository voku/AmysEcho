# Contextual Understanding Implementation

This document describes the current implementation of contextual understanding features in Amy's Echo.

## Overview

Contextual understanding is implemented through the `ContextAwareRecognitionService` located in `app/src/services/contextAwareRecognitionService.ts`. This service enhances gesture recognition by considering various contextual factors to improve accuracy and provide more natural communication.

## Key Features

### 1. Time-of-Day Awareness

The service includes built-in time-of-day detection that adjusts gesture recognition based on the current time:

- **Time Ranges:**
  - Morning: 6am - 12pm
  - Afternoon: 12pm - 5pm
  - Evening: 5pm - 9pm
  - Night: 9pm - 6am

- **Implementation:** The `getTimeOfDay()` method calculates the current time period and stores it with each gesture recognition event.

- **Usage:** Patterns are learned per time-of-day, allowing the system to recognize that Amy might prefer certain gestures at specific times (e.g., "good morning" in the morning).

### 2. Sequence Prediction

The service tracks gesture sequences and predicts likely next gestures:

- **Sequence Learning:** Records the previous gesture for each recognition event
- **Probability Calculation:** Builds transition probabilities between gestures
- **Prediction:** Provides up to 3 predicted next gestures with confidence scores

### 3. Frequency-Based Adjustments

- **Favorite Gestures:** Identifies and boosts confidence for Amy's most frequently used gestures
- **Time-of-Day Preferences:** Learns which gestures Amy prefers at different times
- **Adaptive Boosting:** Applies confidence multipliers based on learned patterns

### 4. Session Context

- **Session Duration Tracking:** Monitors how long Amy has been using the app
- **Fatigue Detection:** Adjusts confidence based on session length (slight reduction if session >30 minutes)
- **Confidence Trends:** Tracks whether Amy's performance is improving, stable, or declining

## Data Structures

### GestureContext
```typescript
interface GestureContext {
  gesture: string;
  confidence: number;
  timestamp: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: number;
  previousGesture?: string;
  sessionDuration: number;
}
```

### RecognitionPattern
```typescript
interface RecognitionPattern {
  gesture: string;
  timeOfDay: string;
  averageConfidence: number;
  frequency: number;
  lastUsed: number;
  commonSequences: Array<{
    nextGesture: string;
    probability: number;
    confidence: number;
  }>;
}
```

## Usage

The service is used throughout the app via the singleton instance:

```typescript
import { contextAwareRecognitionService } from '../services/contextAwareRecognitionService';

// Record a gesture for pattern learning
contextAwareRecognitionService.recordGesture(gesture, confidence, previousGesture);

// Get context-adjusted confidence
const adjustment = contextAwareRecognitionService.getContextAdjustment(gesture, baseConfidence);
const adjustedConfidence = baseConfidence * adjustment.confidenceMultiplier;

// Get predicted next gestures
const predictions = contextAwareRecognitionService.getPredictedGestures(currentGesture);
```

## Integration Points

- **RecognitionScreen:** Records gestures and applies context adjustments
- **Adaptive Learning Service:** Uses context data for personalized learning
- **Analytics:** Provides insights into time-of-day patterns and sequences

## Future Enhancements

While location-based context was planned, the current implementation focuses on time-of-day, sequences, and usage patterns. Location services could be added in the future using `expo-location` for more advanced contextual understanding.
