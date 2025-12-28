# Architecture Decisions

This document records the major architectural choices made for Amy's Echo.

**Project Status:** All major features for Phase 1, 2 and 3 have been implemented. The focus is now on optimization, bug fixing, and production readiness. The `docs/TODO.md` file serves as a living document for ongoing improvements.

## Hybrid-First Recognition
- **Decision**: Use an offline-first gesture recognition pipeline with optional server training.
- **Rationale**: The webapp runs MediaPipe and MLP inference locally, while the server handles training and model distribution.
- **Consequences**: Recognition must stay responsive in the browser and gracefully fall back when personalized models are unavailable.
- **Enhancements**: The pipeline is enhanced with contextual suggestions and adaptive feedback to support Amy’s attempts.

## Technology Stack
- **Decision**: Build the client as a browser-based webapp with TypeScript.
- **Rationale**: Web APIs provide camera access and on-device ML inference while keeping deployment simple.
- **Consequences**: Client code targets modern browsers and relies on web-standard APIs.

## Data Storage
- **Decision**: Store local data in `localStorage` and IndexedDB/OPFS.
- **Rationale**: Browser storage keeps training bundles and profile data available offline.
- **Consequences**: Storage access must handle quota limits and degrade gracefully.

## Audio and Video Feedback
- **Decision**: Use browser audio/video APIs for prompts and DGS video playback.
- **Rationale**: Web APIs keep the feedback loop lightweight and available without native dependencies.
- **Consequences**: Media behavior must be tested across supported browsers.

## Error Handling Philosophy
- **Decision**: Prioritize graceful degradation and user trust over raw accuracy.
- **Rationale**: The system must remain supportive even when recognition fails, especially for a young child.
- **Consequences**: Every failure state requires a recovery path (e.g., "Help Me" flow) rather than exposing technical errors.

## German Sign Language Integration
- **Decision**: Implement DGS gesture recognition using MLP models served via REST API with webapp integration.
- **Rationale**: Provides essential communication capabilities for non-verbal children while maintaining offline functionality and real-time performance.
- **Consequences**: System supports core DGS gestures with multi-layer fallback (MLP → Rule-based) ensuring continuous operation.

## Model Serving Architecture
- **Decision**: Serve ML models via HTTP with strong ETags, range request support, and profile-based authorization.
- **Rationale**: Enables efficient model distribution with caching, partial downloads, and secure per-user model management.
- **Consequences**: Clients can validate model integrity, resume interrupted downloads, and access user-specific gesture models.

## Webapp ML Integration
- **Decision**: Perform gesture recognition in the webapp using MediaPipe for landmark tracking and custom MLP inference.
- **Rationale**: Keeps inference on-device, enabling offline operation and fast feedback.
- **Consequences**: Real-time gesture recognition with automatic fallback when ML models are unavailable.
