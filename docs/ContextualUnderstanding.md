# Contextual Understanding Implementation

This document describes how contextual understanding is implemented in the current webapp codebase.

## Overview

Context is handled by a set of focused services rather than a single monolithic context engine:

- **Gesture suggestions**: `webapp/src/services/gestureSuggester.ts`
- **Adaptive learning**: `webapp/src/services/adaptiveLearningService.ts`
- **Active learning nudges**: `webapp/src/services/activeLearningService.ts`
- **Feedback tuning**: `webapp/src/services/feedbackService.ts`
- **History and sessions**: `webapp/src/services/gestureHistoryService.ts` and `webapp/src/services/engagementTracker.ts`

These modules share lightweight context inputs (recent gestures, time-of-day, confidence) to adjust suggestions, practice prompts, and feedback.

## Key Features

### 1. Time-of-Day Awareness

- `gestureSuggester` receives the current hour (in minutes) and blends it into suggestion scoring.
- `activeLearningService` takes `timeOfDay` in its context input to tune practice cadence.
- `feedbackService` optionally adjusts haptic patterns based on `timeOfDay` to keep feedback gentle.

### 2. History-Based Suggestions

- `gestureHistoryService` persists recent successful signs for each profile.
- `gestureSuggester` uses the recent history list to prioritize familiar gestures when confidence is low.

### 3. Session Context

- `engagementTracker` tracks session lengths and usage cadence.
- `adaptiveLearningService` logs practice sessions so the system can tailor repetition and rest windows.

## Data Structures in Use

`gestureSuggester` exposes a concrete context shape used when generating suggestions:

```typescript
export interface GestureContext {
  recentGestures: string[];
  timeOfDay: number;
  confidence: number;
  landmarks?: number[][][];
  handedness?: string[];
}
```

## Usage Example

```typescript
import { gestureSuggester } from '../services/gestureSuggester';

const suggestions = gestureSuggester.getSuggestions(lastGesture, {
  recentGestures,
  timeOfDay: new Date().getHours() * 60,
  confidence: lastConfidence,
  landmarks,
  handedness,
});
```

## Future Enhancements

Additional context signals (like caregiver-selected environments) can be added by extending the `GestureContext` and feeding them into `gestureSuggester` and `adaptiveLearningService`. Any new context should remain privacy-safe and lightweight so the recognition loop stays fast.
