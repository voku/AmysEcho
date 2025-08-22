# Amy's Echo - TODO List

## Current Status
The gesture recognition pipeline uses a `WebView` with MediaPipe to extract hand landmarks, which are sent to a server for classification. A rule-based classifier in the WebView acts as an offline fallback.
> See [`docs/ExpoGestureRecognition.md`](docs/ExpoGestureRecognition.md) for implementation details.

## ✅ Completed (as of 2025-08-21)
The transition to the WebView + remote classification architecture is complete, including server-side endpoints, in-WebView fallback classifier, updated documentation, and training/recognition workflow improvements.

## 📋 Upcoming Tasks
- [ ] **Implement HIP 4 proactive practice flow**  
      Use `healthScore` to display a non-blocking banner prompting caregivers to rehearse gestures that fall below a threshold.
- [ ] **Build the global learning loop**  
      Batch consented training data, sync it to the server, retrain the cloud model, and deploy updated classifiers back to the app.
- [ ] **Introduce user-friendly error shielding**  
      Create a centralized error boundary and messaging layer so Amy never sees technical errors.
- [ ] **Develop adaptive gesture suggestions**  
      Replace the stubbed logic in `adaptiveLearningService` with a heuristic or ML-based recommendation engine that surfaces useful next gestures to caregivers.
- [ ] **Expand telemetry for usage insights**  
      Extend existing logging to track HIP events and health-score trends.

*Last Updated: 2025-08-22*  
*Project Goal: Turn Amy's gestures into understanding. Every time.*
