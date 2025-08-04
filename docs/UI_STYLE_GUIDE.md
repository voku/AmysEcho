# Amy's Echo UI Style Guide

**Purpose**: Provide LLM-friendly guidelines for building a calm, clear interface that serves non-verbal children and their caregivers.

## 1. Design Principles
- Calm > Speed; Warm > Sterile; Clarity > Density; Guidance > Error.
- Every screen performs one task with large touch targets and generous spacing.
- Maintain trust: failures must surface gentle recovery paths instead of technical errors.

## 2. Color Palette
- **Default**: soft neutrals (`#fff`, `#eee`) with rounded borders.
- **High Contrast Mode**: background `#000`, text `#fff`.
- Prefer pastel accents and emojis for warmth.

## 3. Typography
- Base size: `16`pt; large-text mode: `20`pt.
- All interactive text must have accessible labels and reflect large/high-contrast toggles.

## 4. Layout & Spacing
- Use React Native `StyleSheet` with flexbox.
- Follow an 8‑pt spacing scale; keep layouts center‑aligned where possible.
- Camera view on recognition screen fills width with rounded corners.

## 5. Components
- **Buttons**: `Pressable` with `accessibilityRole="button"` and clear labels.
- **SymbolButton**: shows emoji + word; style adapts to accessibility settings.
- **Correction Panel**: 2x2 grid of large tappable choices.
- Reusable components live in `app/src/components/` and use PascalCase names.

## 6. Animations & Feedback
- Use React Native Animated API for gentle fades or pulse effects.
- Success: large emoji animates in with soft vibration.
- Failure: show a calm `Help Me` button; never abrupt changes.

## 7. Interaction Strings
- Listening state text: "I'm listening…"
- Low-confidence state: show `Help Me` button.
- Avoid exposing technical errors to Amy.

## 8. Accessibility & Offline Resilience
- Always honor `useAccessibility` context for `largeText` and `highContrast`.
- Provide accessible labels for all touchables and media.
- UI must remain fully functional offline; never block on network.

## 9. Code & File Conventions
- Use TypeScript (strict) and React Native functional components.
- Keep styles near components; export shared constants from `app/src/constants/`.
- Name files and components with PascalCase; use camelCase for variables and style keys.
