# Architecture Decisions

This document records the major architectural choices made for Amy's Echo.

**Project Status:** All major features for Phase 1, 2 and 3 have been implemented. The focus is now on optimization, bug fixing, and production readiness. The `docs/TODO.md` file serves as a living document for ongoing improvements.

## Hybrid-First Recognition
- **Decision**: Use a hybrid online/offline gesture recognition pipeline.
- **Rationale**: Online services provide higher accuracy and faster iteration, while a WebView-based detector with a small rule-based classifier ensures functionality without network access.
- **Consequences**: The app must seamlessly switch between modes within 400 ms and always maintain an offline fallback to protect the user experience.
- **Enhancements**: The pipeline is now enhanced with contextual awareness, predictive gestures, and emotional state recognition to provide a more intelligent and supportive user experience.

## Technology Stack
- **Decision**: Build the mobile app with React Native and TypeScript.
- **Rationale**: React Native offers native performance and access to required modules (camera, database, ML) while TypeScript adds type safety.
- **Consequences**: All app code follows strict TypeScript rules and leverages the React Native ecosystem.

## Data Storage
- **Decision**: Store local data with WatermelonDB backed by SQLite.
- **Rationale**: WatermelonDB provides an encrypted local database that synchronizes efficiently when connectivity is available.
- **Consequences**: Database schema and interactions must be defined in WatermelonDB models and kept reactive for UI updates.

## Audio and Video Feedback
- **Decision**: Use Expo modules (`expo-audio`, `expo-speech`, `expo-video`) for media playback and synthesis, replacing the deprecated `expo-av`.
- **Rationale**: Expo libraries provide cross-platform support and a consistent API for audio prompts and DGS video demonstrations.
- **Consequences**: Media features rely on Expo's runtime; additional native modules must be evaluated carefully for compatibility.

## Error Handling Philosophy
- **Decision**: Prioritize graceful degradation and user trust over raw accuracy.
- **Rationale**: The system must remain supportive even when recognition fails, especially for a young child.
- **Consequences**: Every failure state requires a recovery path (e.g., "Help Me" flow) rather than exposing technical errors.

## German Sign Language Integration
- **Decision**: Implement DGS gesture recognition using MLP models served via REST API with WebView integration.
- **Rationale**: Provides essential communication capabilities for non-verbal children while maintaining offline functionality and real-time performance.
- **Consequences**: System supports 12 core DGS gestures with multi-layer fallback (MLP → Centroid → Rule-based) ensuring continuous operation.

## Model Serving Architecture
- **Decision**: Serve ML models via HTTP with strong ETags, range request support, and profile-based authorization.
- **Rationale**: Enables efficient model distribution with caching, partial downloads, and secure per-user model management.
- **Consequences**: Clients can validate model integrity, resume interrupted downloads, and access user-specific gesture models.

## WebView ML Integration
- **Decision**: Perform gesture recognition in WebView using MediaPipe for hand tracking and custom MLP inference.
- **Rationale**: Provides native performance for computer vision tasks while maintaining React Native compatibility and enabling offline operation.
- **Consequences**: Real-time gesture recognition at 30+ FPS with automatic fallback to rule-based detection when ML models are unavailable.
