# Architecture Decisions

This document records the major architectural choices made for Amy's Echo.

## Hybrid-First Recognition
- **Decision**: Use a hybrid online/offline gesture recognition pipeline.
- **Rationale**: Online services provide higher accuracy and faster iteration, while an on-device TensorFlow Lite model guarantees functionality without network access.
- **Consequences**: The app must seamlessly switch between modes within 400 ms and always maintain an offline fallback to protect the user experience.

## Technology Stack
- **Decision**: Build the mobile app with React Native and TypeScript.
- **Rationale**: React Native offers native performance and access to required modules (camera, database, ML) while TypeScript adds type safety.
- **Consequences**: All app code follows strict TypeScript rules and leverages the React Native ecosystem.

## Data Storage
- **Decision**: Store local data with WatermelonDB backed by SQLite.
- **Rationale**: WatermelonDB provides an encrypted, offline-first database that synchronizes efficiently when connectivity is available.
- **Consequences**: Database schema and interactions must be defined in WatermelonDB models and kept reactive for UI updates.

## Audio and Video Feedback
- **Decision**: Use Expo modules (`expo-av`, `expo-speech`, `expo-video`) for media playback and synthesis.
- **Rationale**: Expo libraries provide cross-platform support and a consistent API for audio prompts and DGS video demonstrations.
- **Consequences**: Media features rely on Expo's runtime; additional native modules must be evaluated carefully for compatibility.

## Error Handling Philosophy
- **Decision**: Prioritize graceful degradation and user trust over raw accuracy.
- **Rationale**: The system must remain supportive even when recognition fails, especially for a young child.
- **Consequences**: Every failure state requires a recovery path (e.g., "Help Me" flow) rather than exposing technical errors.

