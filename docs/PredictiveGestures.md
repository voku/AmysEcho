# Predictive Gestures Implementation

This document describes the current predictive-gesture behavior in the webapp.

## Overview

The webapp focuses on **contextual suggestions** rather than full sequence prediction:

- **GestureSuggester** (`webapp/src/services/gestureSuggester.ts`) provides low-confidence alternatives using history, similarity, and time-of-day context.
- **GestureHistoryService** (`webapp/src/services/gestureHistoryService.ts`) keeps recent recognition history per profile.

There is no standalone sequence prediction service in the current codebase; predictive flow is limited to suggestion ranking.

## Key Features

### 1. Intelligent Suggestions

The `GestureSuggester` combines multiple signals:

- **History-Based:** recently successful gestures
- **Similarity-Based:** hand-shape similarity
- **Context-Based:** time-of-day weighting
- **Confusion Patterns:** curated common mix-ups

```typescript
interface GestureSuggestion {
  id: string;
  label: string;
  confidence: number;
  reason: 'similarity' | 'history' | 'context' | 'common_confusion';
}
```

### 2. Lightweight Context Inputs

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

## Performance Considerations

- History is capped to keep memory usage stable.
- Suggestions are deduplicated and weighted by prior success.
- Storage is local to avoid any network dependency for the suggestion loop.

## Future Enhancements

If sequence prediction is reintroduced, it should build on `GestureHistoryService` and keep the inference loop fast enough to avoid delaying Amy’s feedback. Track roadmap items in `docs/TODO.md`.
