# Project Roadmap & TODO

This document outlines the current development roadmap and outstanding tasks for Amy's Echo.

## 🚀 Phase 1: Core Functionality & MVP (Completed)

- [x] Basic gesture recognition (single hand)
- [x] Text-to-speech output for recognized gestures
- [x] Simple UI for recognition screen
- [x] Initial data storage for gestures and profiles
- [x] Onboarding flow (HIP 1)
- [x] Correction flow (HIP 3)

## ✨ Phase 2: Enhanced Learning & Personalization (In Progress)

### High Priority

- [ ] **Adaptive Learning Service (ALS)**: Implement logic to adjust confidence thresholds and suggest practice based on Amy's performance.
  - *Verification:* `src/services/adaptiveLearningService.ts` is implemented, but no explicit tests found.
- [ ] **Personalized Confidence Thresholds**: Dynamically adjust recognition sensitivity per child profile.
  - *Verification:* `src/services/personalizedConfidenceService.ts` is implemented, but no explicit tests found.
- [ ] **Gesture History & Replay**: Store a history of recognized gestures for review and replay.
  - *Verification:* `src/services/gestureHistoryService.ts` is implemented, but no explicit tests found.
- [ ] **Multi-sensory Feedback**: Integrate haptic, audio, and visual cues for recognition.
  - *Verification:* `src/services/multiSensoryFeedback.ts` not found.
- [ ] **Emergency Priority Gestures**: Implement a system for critical gestures (e.g., "Help Me") to bypass normal processing.
  - *Verification:* `src/services/emergencyPriorityService.ts` is implemented, but no explicit tests found.
- [ ] **Zero-Downtime Model Updates**: Allow model updates without interrupting the app's recognition flow.
  - *Verification:* `src/services/zeroDowntimeModelService.ts` is implemented, but no explicit tests found.
- [ ] **Pre-cached LLM Responses**: Store common LLM responses locally for instant feedback.
  - *Verification:* `src/services/preCachedResponseService.ts` is implemented, but no explicit tests found.
- [ ] **Bullying Protection**: Implement security measures to prevent unauthorized use on shared devices.
  - *Verification:* Implemented in `src/screens/ProfileManagerScreen.tsx`, but no explicit tests found.
- [ ] **Gesture Size Tolerance**: Allow caregivers to adjust the tolerance for gesture size variations.
  - *Verification:* Implemented in `src/screens/ProfileManagerScreen.tsx`, but no explicit tests found.

### Medium Priority

- [ ] **Training Mode (HIP 2)**: Guided flow for caregivers to train new gestures.
  - *Verification:* Implemented in `src/screens/TeachingScreen.tsx`, but no explicit tests found.
- [ ] **Practice Mode (HIP 4)**: Guided practice sessions for Amy based on ALS suggestions.
  - *Verification:* Implemented in `src/screens/TrainingScreen.tsx`, but no explicit tests found.
- [ ] **Gesture Combinations/Sequences**: Recognize sequences of gestures (e.g., "more" + "please").
  - *Verification:* `src/services/sequenceRecognizer.ts` is implemented and has tests. `src/services/gestureCombinationService.ts` is implemented, but no explicit tests found.
- [ ] **Adaptive PiP Guidance**: Context-aware Picture-in-Picture video guidance for learning.
  - *Verification:* Implemented in `src/components/PictureInPictureGuidance.tsx` and integrated in `RecognitionScreen.tsx`, but no explicit tests found.
- [ ] **Slow-Motion Replay**: Allow review of gestures in slow motion for learning.
  - *Verification:* Implemented in `src/components/SlowMotionReplay.tsx` and integrated in `RecognitionScreen.tsx`, but no explicit tests found.
- [ ] **Screen Flash Feedback**: Visual feedback for successful gestures in quiet environments.
  - *Verification:* Implemented in `src/components/ScreenFlash.tsx` and integrated in `RecognitionScreen.tsx`, but no explicit tests found.
- [ ] **Gesture Comparison**: Visual comparison of Amy's attempt vs. correct gesture after correction.
  - *Verification:* Implemented in `src/components/GestureComparison.tsx` and integrated in `RecognitionScreen.tsx`, but no explicit tests found.
- [ ] **Mood Selector**: Allow Amy to express her mood, influencing app behavior.
  - *Verification:* Implemented in `src/components/MoodSelector.tsx` and integrated in `RecognitionScreen.tsx`, but no explicit tests found.

### Low Priority

- [ ] **Expanded Analytics Dashboard**: More detailed insights for caregivers.
  - *Verification:* Implemented in `src/components/CommunicationInsights.tsx`, but no explicit tests found.
- [ ] **Custom Audio Support**: Allow caregivers to record custom audio for gestures.
  - *Verification:* Implemented in `src/storage.ts` and `src/services/audioService.ts`, but no explicit tests found.
- [ ] **Caregiver Web Portal**: Web interface for advanced management.
  - *Verification:* Implemented in `server/src/portal/`, but no explicit tests found.

## 🚧 Phase 3: Advanced Features & Refinements (Future)

- [ ] **Multi-hand Gesture Recognition**: Extend recognition to support gestures involving both hands.
- [ ] **Contextual Understanding**: Integrate environmental and temporal context into recognition.
- [ ] **Predictive Gestures**: Suggest next likely gestures based on context.
- [ ] **Emotional State Recognition**: Infer Amy's emotional state from her gestures.
- [ ] **Automated Content Generation**: Generate new learning content based on Amy's progress.
